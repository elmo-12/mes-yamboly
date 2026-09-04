import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MermaListItem, Paginated } from '@mes/types';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import { NoEncontradoException, ValidationException } from '../../common/exceptions/business.exception';
import { cadenaCausaMerma, enriquecerMerma } from '../../common/mappers/enrich';
import { LookupsService, type Lookups } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { ahoraIso, toList } from '../../common/utils/query';
import { Merma } from '../../database/entities';
import { OrdersService } from '../orders/orders.service';
import type { CreateMermaDto, MermaQueryDto, UpdateMermaDto } from './dto/merma.dto';

@Injectable()
export class ScrapService {
  constructor(
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
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
  ): { causaId: string; tipoCausaId: string; clasificacionId: string | null } {
    const causa = lookups.causasMerma.get(dto.causaId);
    if (!causa) throw new ValidationException({ causaId: 'La causa seleccionada no existe' });
    if (causa.nivel !== 'causa') {
      throw new ValidationException({
        causaId: `${causa.codigo} es un nivel «${causa.nivel}»: elige una causa final del árbol`,
      });
    }
    if (causa.estado !== 'activo') {
      throw new ValidationException({ causaId: `La causa ${causa.codigo} está dada de baja` });
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

    return { causaId: causa.id, tipoCausaId, clasificacionId };
  }

  async crear(dto: CreateMermaDto, usuario: AuthUser): Promise<MermaListItem> {
    const lookups = await this.lookups.load();
    const jerarquia = this.validarCausa(lookups, dto);
    /* Las validaciones de negocio se adelantan a las FKs: 422 en vez de 500. */
    if (!lookups.lineas.has(dto.lineaId)) {
      throw new ValidationException({ lineaId: 'La línea seleccionada no existe' });
    }
    if (!lookups.usuarios.has(dto.responsableId)) {
      throw new ValidationException({ responsableId: 'El responsable indicado no existe' });
    }
    const causa = lookups.causasMerma.get(jerarquia.causaId)!;
    const orden = await this.orders.buscar(dto.ordenId);

    const registradaEn = ahoraIso();
    const total = await this.mermas.count();
    const merma = this.mermas.create({
      id: `MER-${orden.id.slice(4)}-N${total + 1}`,
      ordenId: orden.id,
      lineaId: dto.lineaId,
      tipo: dto.tipo,
      cantidadKg: dto.cantidadKg,
      sabor: dto.sabor,
      tipoCausaId: jerarquia.tipoCausaId,
      clasificacionId: jerarquia.clasificacionId,
      causaId: jerarquia.causaId,
      numeroSolicitud: dto.numeroSolicitud ?? null,
      responsableId: dto.responsableId,
      codigoBalde: dto.codigoBalde ?? null,
      enviarPasteurizacion: dto.enviarPasteurizacion ?? false,
      registradaEn,
      tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
      observacion: dto.observacion ?? null,
    });
    await this.mermas.save(merma);
    await this.actualizarOrden(orden.id);

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
    const lookups = await this.lookups.load();

    if (dto.cantidadKg !== undefined && dto.cantidadKg <= 0) {
      throw new ValidationException({ cantidadKg: 'La cantidad debe ser mayor que 0' });
    }

    /* Al reclasificar se revalida el árbol completo con los valores resultantes. */
    const jerarquia = dto.causaId
      ? this.validarCausa(lookups, {
          ...dto,
          tipo: dto.tipo ?? merma.tipo,
          causaId: dto.causaId,
          observacion: dto.observacion ?? merma.observacion ?? undefined,
          numeroSolicitud: dto.numeroSolicitud ?? merma.numeroSolicitud ?? undefined,
        } as CreateMermaDto)
      : null;

    const anterior = { tipo: merma.tipo, cantidadKg: merma.cantidadKg, causaId: merma.causaId };
    Object.assign(merma, {
      ...dto,
      codigoBalde: dto.codigoBalde ?? merma.codigoBalde,
      observacion: dto.observacion ?? merma.observacion,
      numeroSolicitud: dto.numeroSolicitud ?? merma.numeroSolicitud,
    });
    if (jerarquia) {
      merma.causaId = jerarquia.causaId;
      merma.tipoCausaId = jerarquia.tipoCausaId;
      merma.clasificacionId = jerarquia.clasificacionId;
    }
    await this.mermas.save(merma);
    await this.actualizarOrden(merma.ordenId);

    await this.audit.registrar({
      ordenId: merma.ordenId,
      tipo: 'edicion',
      usuario,
      texto: `${usuario.nombre} editó la merma ${merma.id}: ${anterior.tipo} ${anterior.cantidadKg} kg → ${merma.tipo} ${merma.cantidadKg} kg`,
    });

    return enriquecerMerma(merma, await this.lookups.load());
  }

  private async actualizarOrden(ordenId: string): Promise<void> {
    const orden = await this.orders.buscar(ordenId);
    await this.orders.recalcular(orden);
    await this.orders.guardar(orden);
  }

  private emitirTri(evento: TriRegistroEvent): void {
    this.events.emit(TRI_REGISTRO_EVENT, evento);
  }
}
