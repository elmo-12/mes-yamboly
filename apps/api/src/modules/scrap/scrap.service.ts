import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MermaListItem, Paginated } from '@mes/types';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import { NoEncontradoException, ValidationException } from '../../common/exceptions/business.exception';
import { assertCapturaEnOrden } from '../../common/auth/acceso-orden';
import { insertarConIdSecuencial } from '../../common/utils/ids';
import { ancestroInactivo, cadenaCausaMerma, enriquecerMerma } from '../../common/mappers/enrich';
import { LookupsService, type Lookups } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { ahoraPlanta } from '@mes/shared';
import { toList } from '../../common/utils/query';
import { Merma } from '../../database/entities';
import { OrdersService } from '../orders/orders.service';
import { AdjuntosService } from '../attachments/adjuntos.service';
import type { CreateMermaDto, MermaQueryDto, UpdateMermaDto } from './dto/merma.dto';

@Injectable()
export class ScrapService {
  constructor(
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
    private readonly adjuntos: AdjuntosService,
  ) {}

  async listar(query: MermaQueryDto): Promise<Paginated<MermaListItem>> {
    const lookups = await this.lookups.load();
    const lineaIds = toList(query.lineaId);
    const tipos = toList(query.tipo);
    const causaIds = toList(query.causaId);

    let items = await this.mermas.find();
    if (query.ordenId) items = items.filter((m) => m.ordenId === query.ordenId);
    if (lineaIds.length > 0) items = items.filter((m) => lineaIds.includes(m.lineaId));
    if (tipos.length > 0) items = items.filter((m) => tipos.includes(m.tipo));
    if (causaIds.length > 0) items = items.filter((m) => causaIds.includes(m.causaId));
    if (query.desde) items = items.filter((m) => m.registradaEn.slice(0, 10) >= query.desde!);
    if (query.hasta) items = items.filter((m) => m.registradaEn.slice(0, 10) <= query.hasta!);

    items.sort((a, b) => b.registradaEn.localeCompare(a.registradaEn));
    return paginate(
      items.map((m) => enriquecerMerma(m, lookups)),
      query.page,
      query.pageSize,
    );
  }

  /**
   * Valida el árbol de causas de merma: la causa elegida debe ser una **hoja
   * activa** (`nivel: 'causa'`) y su cadena de padres debe coincidir con la
   * clasificación y el tipo enviados (si no vienen, se derivan de la hoja).
   * Además exige `observacion` / `numeroSolicitud` cuando la causa lo marca.
   */
  private validarCausa(
    lookups: Lookups,
    dto: CreateMermaDto,
    exigirActiva = true,
  ): { causaId: string; tipoCausaId: string; clasificacionId: string | null } {
    const causa = lookups.causasMerma.get(dto.causaId);
    if (!causa) throw new ValidationException({ causaId: 'La causa seleccionada no existe' });
    if (causa.nivel !== 'causa') {
      throw new ValidationException({
        causaId: `${causa.codigo} es un nivel «${causa.nivel}»: elige una causa final del árbol`,
      });
    }
    if (exigirActiva && causa.estado !== 'activo') {
      throw new ValidationException({ causaId: `La causa ${causa.codigo} está dada de baja` });
    }
    /* Toda la rama debe estar activa: una hija activa bajo un padre dado de baja
     * (datos heredados) tampoco se puede elegir. */
    const baja = exigirActiva ? ancestroInactivo(lookups.causasMerma, causa.id) : undefined;
    if (baja) {
      throw new ValidationException({
        causaId: `La causa ${causa.codigo} cuelga de ${baja.codigo} ${baja.nombre}, que está dada de baja`,
      });
    }
    const lineas = causa.lineasAplicables ?? [];
    if (dto.lineaId && lineas.length > 0 && !lineas.includes(dto.lineaId)) {
      throw new ValidationException({ causaId: `La causa ${causa.codigo} no aplica a esta línea` });
    }
    if (causa.aplicaA.length > 0 && !causa.aplicaA.includes(dto.tipo)) {
      throw new ValidationException({
        causaId: `La causa ${causa.codigo} no aplica a mermas de tipo ${dto.tipo}`,
      });
    }

    const cadena = cadenaCausaMerma(lookups, causa.id);
    const tipoCausaId = cadena.tipo?.id;
    const clasificacionId = cadena.clasificacion?.id ?? null;
    if (!tipoCausaId) {
      throw new ValidationException({
        causaId: `La causa ${causa.codigo} no cuelga de ningún tipo de merma`,
      });
    }

    if (dto.tipoCausaId && dto.tipoCausaId !== tipoCausaId) {
      throw new ValidationException({
        tipoCausaId: `La causa ${causa.codigo} no pertenece al tipo de producción seleccionado`,
      });
    }
    if (dto.clasificacionId && dto.clasificacionId !== clasificacionId) {
      throw new ValidationException({
        clasificacionId: `La causa ${causa.codigo} no pertenece a la clasificación seleccionada`,
      });
    }
    if (causa.requiereComentario && !dto.observacion?.trim()) {
      throw new ValidationException({
        observacion: `La causa ${causa.codigo} exige un comentario`,
      });
    }
    if (causa.requiereSolicitud && !dto.numeroSolicitud?.trim()) {
      throw new ValidationException({
        numeroSolicitud: `La causa ${causa.codigo} exige un n.º de solicitud`,
      });
    }
    /* La foto ya no es sólo una regla del asistente: si la causa la exige, la
     * merma no se guarda sin ella (el vínculo se valida aparte con
     * `AdjuntosService.validarVinculo`). */
    if (causa.requiereEvidencia && !dto.evidenciaUrl) {
      throw new ValidationException({
        evidenciaUrl: `La causa ${causa.codigo} exige una foto de evidencia`,
      });
    }

    return { causaId: causa.id, tipoCausaId, clasificacionId };
  }

  /** El sabor viaja como nombre: debe existir en el catálogo (sin distinguir mayúsculas). */
  private validarSabor(lookups: Lookups, sabor: string): string {
    const buscado = sabor.trim().toLowerCase();
    const encontrado = [...lookups.sabores.values()].find(
      (s) => s.nombre.trim().toLowerCase() === buscado,
    );
    if (!encontrado) {
      throw new ValidationException({ sabor: 'El sabor no existe en el catálogo' });
    }
    return encontrado.nombre;
  }

  async crear(dto: CreateMermaDto, usuario: AuthUser): Promise<MermaListItem> {
    const lookups = await this.lookups.load();
    /* Las validaciones de negocio se adelantan a las FKs: 422 en vez de 500. */
    if (!lookups.lineas.has(dto.lineaId)) {
      throw new ValidationException({ lineaId: 'La línea seleccionada no existe' });
    }
    const orden = await this.orders.buscar(dto.ordenId);
    assertCapturaEnOrden(orden, usuario, dto.lineaId);
    const jerarquia = this.validarCausa(lookups, dto);
    if (!lookups.usuarios.has(dto.responsableId)) {
      throw new ValidationException({ responsableId: 'El responsable indicado no existe' });
    }
    const sabor = this.validarSabor(lookups, dto.sabor);
    if (dto.evidenciaUrl) {
      await this.adjuntos.validarVinculo(dto.evidenciaUrl, { usuarioId: usuario.id });
    }
    const causa = lookups.causasMerma.get(jerarquia.causaId)!;

    /* Hora de planta (America/Lima) explícita, igual que las órdenes. */
    const registradaEn = ahoraPlanta();
    const merma = this.mermas.create({
      id: '',
      ordenId: orden.id,
      lineaId: dto.lineaId,
      tipo: dto.tipo,
      cantidadKg: dto.cantidadKg,
      sabor,
      tipoCausaId: jerarquia.tipoCausaId,
      clasificacionId: jerarquia.clasificacionId,
      causaId: jerarquia.causaId,
      numeroSolicitud: dto.numeroSolicitud || null,
      evidenciaUrl: dto.evidenciaUrl || null,
      responsableId: dto.responsableId,
      codigoBalde: dto.codigoBalde || null,
      enviarPasteurizacion: dto.enviarPasteurizacion ?? false,
      registradaEn,
      tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
      observacion: dto.observacion || null,
    });
    await insertarConIdSecuencial(this.mermas, merma, (n) => `MER-${orden.id.slice(4)}-N${n}`);
    await this.actualizarOrden(orden.id, usuario);

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'merma',
      usuario,
      fecha: registradaEn,
      texto: `${usuario.nombre} registró merma ${merma.tipo} ${merma.cantidadKg} kg · ${causa.codigo} ${causa.nombre}`,
    });

    this.emitirTri({
      tipo: 'merma',
      segundos: merma.tiempoRegistroSeg,
      usuarioId: usuario.id,
      fecha: registradaEn.slice(0, 10),
      referenciaId: merma.id,
      descripcion: `Merma ${merma.tipo} ${merma.cantidadKg} kg`,
    });

    return enriquecerMerma(merma, await this.lookups.load());
  }

  async actualizar(id: string, dto: UpdateMermaDto, usuario: AuthUser): Promise<MermaListItem> {
    const merma = await this.mermas.findOne({ where: { id } });
    if (!merma) throw new NoEncontradoException('Merma');
    const orden = await this.orders.buscar(merma.ordenId);
    assertCapturaEnOrden(orden, usuario);
    const lookups = await this.lookups.load();

    /* Una merma no se mueve de orden ni de línea: el kg quedaría contado en la
     * orden de origen (y una orden inexistente terminaba en 500). */
    if (dto.ordenId !== undefined && dto.ordenId !== merma.ordenId) {
      throw new ValidationException({ ordenId: 'Una merma no se puede mover a otra orden' });
    }
    if (dto.lineaId !== undefined && dto.lineaId !== merma.lineaId) {
      throw new ValidationException({ lineaId: 'Una merma no se puede mover a otra línea' });
    }
    if (dto.cantidadKg !== undefined && dto.cantidadKg <= 0) {
      throw new ValidationException({ cantidadKg: 'La cantidad debe ser mayor que 0' });
    }
    if (dto.responsableId !== undefined && !lookups.usuarios.has(dto.responsableId)) {
      throw new ValidationException({ responsableId: 'El responsable indicado no existe' });
    }
    const sabor = dto.sabor !== undefined ? this.validarSabor(lookups, dto.sabor) : merma.sabor;

    const numeroSolicitud =
      dto.numeroSolicitud !== undefined ? dto.numeroSolicitud || null : merma.numeroSolicitud;
    const observacion = dto.observacion !== undefined ? dto.observacion || null : merma.observacion;
    const evidenciaUrl =
      dto.evidenciaUrl !== undefined ? dto.evidenciaUrl || null : merma.evidenciaUrl;
    const tipo = dto.tipo ?? merma.tipo;

    /* Cualquier cambio que afecte al árbol (tipo, causa, nivel o exigencias) se
     * revalida con los valores resultantes; la causa dada de baja solo se
     * rechaza si se elige ahora (no bloquea editar registros antiguos). */
    const causaCambia = dto.causaId !== undefined && dto.causaId !== merma.causaId;
    const tocaArbol =
      causaCambia ||
      dto.tipo !== undefined ||
      dto.tipoCausaId !== undefined ||
      dto.clasificacionId !== undefined ||
      dto.numeroSolicitud !== undefined ||
      dto.observacion !== undefined ||
      dto.evidenciaUrl !== undefined;
    const jerarquia = tocaArbol
      ? this.validarCausa(
          lookups,
          {
            ...dto,
            lineaId: merma.lineaId,
            tipo,
            causaId: dto.causaId ?? merma.causaId,
            observacion: observacion ?? undefined,
            numeroSolicitud: numeroSolicitud ?? undefined,
            evidenciaUrl: evidenciaUrl ?? undefined,
          } as CreateMermaDto,
          causaCambia,
        )
      : null;
    if (evidenciaUrl && evidenciaUrl !== merma.evidenciaUrl) {
      await this.adjuntos.validarVinculo(evidenciaUrl, { usuarioId: usuario.id, mermaId: merma.id });
    }

    const anterior = { tipo: merma.tipo, cantidadKg: merma.cantidadKg, causaId: merma.causaId };
    merma.tipo = tipo;
    if (dto.cantidadKg !== undefined) merma.cantidadKg = dto.cantidadKg;
    merma.sabor = sabor;
    merma.numeroSolicitud = numeroSolicitud;
    merma.observacion = observacion;
    merma.evidenciaUrl = evidenciaUrl;
    if (dto.responsableId !== undefined) merma.responsableId = dto.responsableId;
    if (dto.codigoBalde !== undefined) merma.codigoBalde = dto.codigoBalde || null;
    if (dto.enviarPasteurizacion !== undefined) merma.enviarPasteurizacion = dto.enviarPasteurizacion;
    if (jerarquia) {
      merma.causaId = jerarquia.causaId;
      merma.tipoCausaId = jerarquia.tipoCausaId;
      merma.clasificacionId = jerarquia.clasificacionId;
    }
    await this.mermas.save(merma);
    await this.actualizarOrden(merma.ordenId, usuario);

    const causaTexto =
      anterior.causaId !== merma.causaId
        ? ` · causa: ${lookups.causasMerma.get(anterior.causaId)?.codigo ?? anterior.causaId} → ${lookups.causasMerma.get(merma.causaId)?.codigo ?? merma.causaId}`
        : '';
    await this.audit.registrar({
      ordenId: merma.ordenId,
      tipo: 'edicion',
      usuario,
      texto: `${usuario.nombre} editó la merma ${merma.id}: ${anterior.tipo} ${anterior.cantidadKg} kg → ${merma.tipo} ${merma.cantidadKg} kg${causaTexto}`,
    });

    return enriquecerMerma(merma, await this.lookups.load());
  }

  /** Recalcula la orden con el usuario: nunca una validada ni, sin permiso, una cerrada. */
  private async actualizarOrden(ordenId: string, usuario: AuthUser): Promise<void> {
    const orden = await this.orders.buscar(ordenId);
    if (await this.orders.recalcular(orden, usuario)) await this.orders.guardar(orden);
  }

  private emitirTri(evento: TriRegistroEvent): void {
    this.events.emit(TRI_REGISTRO_EVENT, evento);
  }
}
