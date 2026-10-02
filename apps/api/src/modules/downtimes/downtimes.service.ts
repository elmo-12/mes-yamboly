import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Not, Repository } from 'typeorm';
import type {
  DeteccionIoT as DeteccionDto,
  Paginated,
  ParadaListItem,
} from '@mes/types';
import { assertAccesoLinea } from '../../common/auth/acceso-linea';
import { assertCapturaEnOrden } from '../../common/auth/acceso-orden';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import {
  ConflictoException,
  NoEncontradoException,
  ValidationException,
} from '../../common/exceptions/business.exception';
import { ancestroInactivo, enriquecerParada, tipoDeCausa } from '../../common/mappers/enrich';
import { LookupsService, type Lookups } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { toList } from '../../common/utils/query';
import { insertarConIdSecuencial } from '../../common/utils/ids';
import {
  esFuturo,
  MENSAJE_ISO_LOCAL,
  minutosConSigno,
  normalizarIsoLocal,
} from '../../common/utils/fechas';
import { DeteccionIoT, OrdenFabricacion, Parada } from '../../database/entities';
import { AdjuntosService } from '../attachments/adjuntos.service';
import { OrdersService } from '../orders/orders.service';
import type {
  ConfirmarDeteccionDto,
  CreateParadaDto,
  FinalizeParadaDto,
  ParadaQueryDto,
  UpdateParadaDto,
} from './dto/parada.dto';

type CausaParadaFila = NonNullable<ReturnType<Lookups['causasParada']['get']>>;

/** Recorta un ISO local al minuto: el asistente solo envía `HH:mm`, los cierres guardan segundos. */
const alMinuto = (iso: string) => iso.slice(0, 16);

const hhmm = (iso: string | null | undefined) => (iso ? iso.slice(11, 16) : 'abierta');

@Injectable()
export class DowntimesService {
  constructor(
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(DeteccionIoT) private readonly detecciones: Repository<DeteccionIoT>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
    private readonly adjuntos: AdjuntosService,
  ) {}

  async listar(query: ParadaQueryDto): Promise<Paginated<ParadaListItem>> {
    const lookups = await this.lookups.load();
    const lineaIds = toList(query.lineaId);
    const causaIds = toList(query.causaId);

    let items = await this.paradas.find();
    if (query.ordenId) items = items.filter((p) => p.ordenId === query.ordenId);
    if (lineaIds.length > 0) items = items.filter((p) => lineaIds.includes(p.lineaId));
    if (causaIds.length > 0) {
      items = items.filter((p) => causaIds.includes(p.causaId) || causaIds.includes(p.tipoCausaId));
    }
    if (query.desde) items = items.filter((p) => p.inicio.slice(0, 10) >= query.desde!);
    if (query.hasta) items = items.filter((p) => p.inicio.slice(0, 10) <= query.hasta!);
    if (query.abiertas) items = items.filter((p) => p.fin === null);

    items.sort((a, b) => b.inicio.localeCompare(a.inicio));
    return paginate(
      items.map((p) => enriquecerParada(p, lookups)),
      query.page,
      query.pageSize,
    );
  }

  /* ---------------------------------------------------------------- */
  /* Validaciones de negocio                                           */
  /* ---------------------------------------------------------------- */

  /**
   * La causa debe ser una **hoja** (`nivel: especifica`) del árbol, aplicable a
   * la línea y —si se pide— activa; el `tipoCausaId` enviado debe ser su raíz.
   */
  private validarCausa(
    lookups: Lookups,
    causaId: string,
    lineaId: string,
    tipoCausaId: string | undefined,
    exigirActiva: boolean,
  ): { causa: CausaParadaFila; tipoId: string } {
    const causa = lookups.causasParada.get(causaId);
    if (!causa) throw new ValidationException({ causaId: 'La causa seleccionada no existe' });
    if (causa.nivel !== 'especifica') {
      throw new ValidationException({
        causaId: `${causa.codigo} es un nivel «${causa.nivel}»: elige una causa específica del árbol`,
      });
    }
    if (exigirActiva && causa.estado === 'inactivo') {
      throw new ValidationException({ causaId: 'La causa está dada de baja' });
    }
    /* Toda la rama debe estar activa: una hija activa bajo un padre dado de baja
     * (datos heredados) tampoco se puede elegir. */
    const baja = exigirActiva ? ancestroInactivo(lookups.causasParada, causa.id) : undefined;
    if (baja) {
      throw new ValidationException({
        causaId: `La causa ${causa.codigo} cuelga de ${baja.codigo} ${baja.nombre}, que está dada de baja`,
      });
    }
    const lineas = causa.lineasAplicables ?? [];
    if (lineas.length > 0 && !lineas.includes(lineaId)) {
      throw new ValidationException({ causaId: `La causa ${causa.codigo} no aplica a esta línea` });
    }
    const tipoId = tipoDeCausa(lookups, causa.id)?.id ?? causa.id;
    if (tipoCausaId && tipoCausaId !== tipoId) {
      throw new ValidationException({
        tipoCausaId: `La causa ${causa.codigo} no pertenece al tipo de parada seleccionado`,
      });
    }
    return { causa, tipoId };
  }

  /** N.º de solicitud y foto exigidos por la causa. */
  private validarRequisitos(
    causa: CausaParadaFila,
    numeroSolicitud: string | null | undefined,
    evidenciaUrl: string | null | undefined,
  ): void {
    if (causa.requiereSolicitud && !numeroSolicitud?.trim()) {
      throw new ValidationException({
        numeroSolicitud: `La causa ${causa.codigo} exige el número de solicitud de mantenimiento`,
      });
    }
    if (causa.requiereEvidencia && !evidenciaUrl) {
      throw new ValidationException({
        evidenciaUrl: `La causa ${causa.codigo} exige una foto de evidencia`,
      });
    }
  }

  /**
   * Horas de la parada: ISO local válido, no en el futuro (salvo tolerancia),
   * dentro del rango de la orden y `fin ≥ inicio`. Devuelve los valores
   * normalizados a `AAAA-MM-DDTHH:mm:ss`.
   */
  private validarHoras(
    orden: OrdenFabricacion,
    inicioCrudo: string,
    finCrudo: string | null,
  ): { inicio: string; fin: string | null } {
    const inicio = normalizarIsoLocal(inicioCrudo);
    if (!inicio) throw new ValidationException({ inicio: MENSAJE_ISO_LOCAL });
    const fin = finCrudo === null ? null : normalizarIsoLocal(finCrudo);
    if (finCrudo !== null && !fin) throw new ValidationException({ fin: MENSAJE_ISO_LOCAL });

    const ordenInicio = normalizarIsoLocal(orden.inicio) ?? orden.inicio;
    const ordenFin = orden.fin ? (normalizarIsoLocal(orden.fin) ?? orden.fin) : null;

    if (esFuturo(inicio)) {
      throw new ValidationException({ inicio: 'La hora de inicio no puede estar en el futuro' });
    }
    /* Comparación a nivel de minuto: la orden guarda segundos y el asistente no. */
    if (alMinuto(inicio) < alMinuto(ordenInicio)) {
      throw new ValidationException({
        inicio: `La parada no puede empezar antes del inicio de la orden (${ordenInicio.slice(0, 16).replace('T', ' ')})`,
      });
    }
    if (ordenFin && alMinuto(inicio) > alMinuto(ordenFin)) {
      throw new ValidationException({
        inicio: `La parada no puede empezar después del fin de la orden (${ordenFin.slice(0, 16).replace('T', ' ')})`,
      });
    }
    /* En una orden que ya no está en curso nadie podría cerrar la parada: `fin` es obligatorio. */
    if (!fin && orden.estado !== 'en_curso') {
      throw new ValidationException({
        fin: 'La orden ya no está en curso: la parada debe registrarse con hora de fin',
      });
    }
    if (fin) {
      if (esFuturo(fin)) {
        throw new ValidationException({ fin: 'La hora de fin no puede estar en el futuro' });
      }
      if (alMinuto(fin) < alMinuto(inicio)) {
        throw new ValidationException({
          fin: 'La hora de fin debe ser posterior o igual a la de inicio',
        });
      }
      if (ordenFin && alMinuto(fin) > alMinuto(ordenFin)) {
        throw new ValidationException({
          fin: `La parada no puede terminar después del fin de la orden (${ordenFin.slice(0, 16).replace('T', ' ')})`,
        });
      }
    }
    return { inicio, fin };
  }

  /** Una sola parada abierta por línea y sin solapes con otras de la misma línea. */
  private async validarSolapes(
    lineaId: string,
    inicio: string,
    fin: string | null,
    excluirId?: string,
  ): Promise<void> {
    const excluir = excluirId ? { id: Not(excluirId) } : {};
    /* Tolerancia de un minuto: se compara a nivel de minuto. Un registro que acaba
     * a las 15:24:40 no choca con otro que empieza a «15:24». */
    const inicioMin = `${alMinuto(inicio)}:00`;
    const inicioTope = `${alMinuto(inicio)}:59`;
    const finMin = fin ? `${alMinuto(fin)}:00` : null;
    if (fin === null) {
      const abierta = await this.paradas.findOne({ where: { lineaId, fin: IsNull(), ...excluir } });
      if (abierta) {
        throw new ConflictoException(
          `La línea ya tiene una parada abierta desde el ${abierta.inicio.slice(0, 10)} ${hhmm(abierta.inicio)} (orden ${abierta.ordenId}): ciérrala antes de registrar otra`,
          { paradaAbiertaId: abierta.id },
        );
      }
    }
    /* Solape con paradas cerradas: [inicio, fin) ∩ [p.inicio, p.fin) ≠ ∅. */
    const solapada = await this.paradas.findOne({
      where: {
        lineaId,
        fin: MoreThan(inicioTope),
        ...(finMin ? { inicio: LessThan(finMin) } : {}),
        ...excluir,
      },
      order: { inicio: 'ASC' },
    });
    if (solapada) {
      throw new ConflictoException(
        `Se solapa con la parada ${hhmm(solapada.inicio)}–${hhmm(solapada.fin)} de la misma línea`,
        { paradaId: solapada.id },
      );
    }
    /* Una abierta anterior "cubre" todo lo posterior. */
    if (fin !== null || excluirId) {
      const abiertaAntes = await this.paradas.findOne({
        where: {
          lineaId,
          fin: IsNull(),
          inicio: LessThan(finMin ?? inicioMin),
          ...excluir,
        },
        order: { inicio: 'ASC' },
      });
      if (abiertaAntes) {
        throw new ConflictoException(
          `Se solapa con la parada abierta desde las ${hhmm(abiertaAntes.inicio)} de la misma línea`,
          { paradaId: abiertaAntes.id },
        );
      }
    }
  }

  private async validarDeteccion(deteccionId: string, lineaId: string): Promise<DeteccionIoT> {
    const deteccion = await this.detecciones.findOne({ where: { id: deteccionId } });
    if (!deteccion) {
      throw new ValidationException({ deteccionId: 'La detección IoT indicada no existe' });
    }
    if (deteccion.lineaId !== lineaId) {
      throw new ValidationException({ deteccionId: 'La detección IoT es de otra línea' });
    }
    if (deteccion.estado !== 'sugerida') {
      throw new ConflictoException('La detección ya fue procesada', { estado: deteccion.estado });
    }
    return deteccion;
  }

  /* ---------------------------------------------------------------- */
  /* Mutaciones                                                        */
  /* ---------------------------------------------------------------- */

  async crear(dto: CreateParadaDto, usuario: AuthUser): Promise<ParadaListItem> {
    const lookups = await this.lookups.load();
    /* La parada se registra hasta la línea: no existe nivel máquina. */
    if (!lookups.lineas.has(dto.lineaId)) {
      throw new ValidationException({ lineaId: 'La línea seleccionada no existe' });
    }
    const orden = await this.orders.buscar(dto.ordenId);
    assertCapturaEnOrden(orden, usuario, dto.lineaId);

    const { causa, tipoId } = this.validarCausa(
      lookups,
      dto.causaId,
      dto.lineaId,
      dto.tipoCausaId,
      true,
    );
    /* La validación de negocio se adelanta a la FK: 422 en vez de 500. */
    if (!lookups.usuarios.has(dto.responsableId)) {
      throw new ValidationException({ responsableId: 'El responsable indicado no existe' });
    }
    const numeroSolicitud = dto.numeroSolicitud?.trim() || null;
    const evidenciaUrl = dto.evidenciaUrl || null;
    this.validarRequisitos(causa, numeroSolicitud, evidenciaUrl);
    if (evidenciaUrl) await this.adjuntos.validarVinculo(evidenciaUrl, { usuarioId: usuario.id });

    const { inicio, fin } = this.validarHoras(orden, dto.inicio, dto.fin ?? null);
    await this.validarSolapes(dto.lineaId, inicio, fin);

    const deteccion = dto.deteccionId
      ? await this.validarDeteccion(dto.deteccionId, dto.lineaId)
      : null;

    const parada = this.paradas.create({
      id: '',
      ordenId: orden.id,
      lineaId: dto.lineaId,
      causaId: causa.id,
      tipoCausaId: tipoId,
      inicio,
      fin,
      duracionMin: fin ? Math.max(0, minutosConSigno(inicio, fin)) : 0,
      accionTomada: dto.accionTomada,
      numeroSolicitud,
      evidenciaUrl,
      afectaOee: dto.afectaOee ?? causa.afectaOee,
      responsableId: dto.responsableId,
      origen: deteccion ? 'iot' : (dto.origen ?? 'manual'),
      deteccionId: deteccion?.id ?? null,
      tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
      comentarioCierre: null,
    });
    await insertarConIdSecuencial(this.paradas, parada, (n) => `PAR-${orden.id.slice(4)}-N${n}`);

    if (deteccion) {
      deteccion.estado = 'confirmada';
      deteccion.paradaId = parada.id;
      await this.detecciones.save(deteccion);
    }
    await this.actualizarOrden(orden.id, usuario);

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'parada',
      usuario,
      fecha: parada.inicio,
      texto: `${usuario.nombre} registró la parada ${parada.inicio.slice(11, 16)} ${causa.codigo} ${causa.nombre}`,
    });

    this.emitirTri({
      tipo: 'parada',
      segundos: parada.tiempoRegistroSeg,
      usuarioId: usuario.id,
      fecha: parada.inicio.slice(0, 10),
      referenciaId: parada.id,
      descripcion: `Parada ${causa.codigo} ${causa.nombre}`,
    });

    return enriquecerParada(parada, await this.lookups.load());
  }

  async actualizar(id: string, dto: UpdateParadaDto, usuario: AuthUser): Promise<ParadaListItem> {
    const parada = await this.paradas.findOne({ where: { id } });
    if (!parada) throw new NoEncontradoException('Parada');
    const orden = await this.orders.buscar(parada.ordenId);
    assertCapturaEnOrden(orden, usuario);
    const lookups = await this.lookups.load();

    if (
      (dto.ordenId !== undefined && dto.ordenId !== parada.ordenId) ||
      (dto.lineaId !== undefined && dto.lineaId !== parada.lineaId)
    ) {
      throw new ValidationException({
        [dto.ordenId !== undefined && dto.ordenId !== parada.ordenId ? 'ordenId' : 'lineaId']:
          'Una parada no se puede mover a otra orden ni a otra línea',
      });
    }

    const cambios: string[] = [];
    const causaCambia = Boolean(dto.causaId && dto.causaId !== parada.causaId);
    const { causa, tipoId } = this.validarCausa(
      lookups,
      dto.causaId ?? parada.causaId,
      parada.lineaId,
      dto.tipoCausaId,
      causaCambia,
    );
    if (causaCambia) {
      const anterior = lookups.causasParada.get(parada.causaId);
      cambios.push(`causa: ${anterior?.codigo ?? parada.causaId} → ${causa.codigo}`);
      parada.causaId = causa.id;
      parada.tipoCausaId = tipoId;
      parada.afectaOee = dto.afectaOee ?? causa.afectaOee;
    }

    if (dto.responsableId && dto.responsableId !== parada.responsableId) {
      if (!lookups.usuarios.has(dto.responsableId)) {
        throw new ValidationException({ responsableId: 'El responsable indicado no existe' });
      }
      cambios.push('responsable actualizado');
      parada.responsableId = dto.responsableId;
    }

    const numeroSolicitud =
      dto.numeroSolicitud !== undefined ? dto.numeroSolicitud?.trim() || null : (parada.numeroSolicitud ?? null);
    const evidenciaUrl =
      dto.evidenciaUrl !== undefined ? dto.evidenciaUrl || null : (parada.evidenciaUrl ?? null);
    if (causaCambia || dto.numeroSolicitud !== undefined || dto.evidenciaUrl !== undefined) {
      this.validarRequisitos(causa, numeroSolicitud, evidenciaUrl);
    }
    if (evidenciaUrl && evidenciaUrl !== parada.evidenciaUrl) {
      await this.adjuntos.validarVinculo(evidenciaUrl, { usuarioId: usuario.id, paradaId: parada.id });
      cambios.push('foto de evidencia actualizada');
    }
    if (numeroSolicitud !== (parada.numeroSolicitud ?? null)) cambios.push('n.º de solicitud actualizado');
    parada.numeroSolicitud = numeroSolicitud;
    parada.evidenciaUrl = evidenciaUrl;

    if (dto.accionTomada && dto.accionTomada !== parada.accionTomada) {
      cambios.push('acción tomada actualizada');
      parada.accionTomada = dto.accionTomada;
    }

    const inicioNuevo = dto.inicio ?? parada.inicio;
    const finNuevo = dto.fin !== undefined ? dto.fin : parada.fin;
    if (inicioNuevo !== parada.inicio || finNuevo !== parada.fin) {
      const horas = this.validarHoras(orden, inicioNuevo, finNuevo);
      await this.validarSolapes(parada.lineaId, horas.inicio, horas.fin, parada.id);
      if (horas.inicio !== parada.inicio) {
        cambios.push(`inicio: ${hhmm(parada.inicio)} → ${hhmm(horas.inicio)}`);
      }
      if (horas.fin !== parada.fin) cambios.push(`fin: ${hhmm(parada.fin)} → ${hhmm(horas.fin)}`);
      parada.inicio = horas.inicio;
      parada.fin = horas.fin;
      parada.duracionMin = horas.fin ? Math.max(0, minutosConSigno(horas.inicio, horas.fin)) : 0;
    }
    if (dto.afectaOee !== undefined && dto.afectaOee !== parada.afectaOee) {
      cambios.push(`afecta OEE: ${dto.afectaOee ? 'sí' : 'no'}`);
      parada.afectaOee = dto.afectaOee;
    }

    await this.paradas.save(parada);
    await this.actualizarOrden(parada.ordenId, usuario);

    const detalle = cambios.length > 0 ? cambios.join(' · ') : 'sin cambios relevantes';
    await this.audit.registrar({
      ordenId: parada.ordenId,
      tipo: 'edicion',
      usuario,
      texto: `${usuario.nombre} editó la parada ${parada.inicio.slice(11, 16)}: ${detalle}${dto.motivoEdicion ? ` · motivo: ${dto.motivoEdicion}` : ''}`,
    });

    return enriquecerParada(parada, await this.lookups.load());
  }

  async finalizar(id: string, dto: FinalizeParadaDto, usuario: AuthUser): Promise<ParadaListItem> {
    const parada = await this.paradas.findOne({ where: { id } });
    if (!parada) throw new NoEncontradoException('Parada');
    if (parada.fin) {
      throw new ConflictoException('La parada ya fue finalizada', { fin: parada.fin });
    }
    const orden = await this.orders.buscar(parada.ordenId);
    assertCapturaEnOrden(orden, usuario);
    const { inicio, fin } = this.validarHoras(orden, parada.inicio, dto.fin);
    await this.validarSolapes(parada.lineaId, inicio, fin, parada.id);

    parada.fin = fin;
    parada.duracionMin = Math.max(0, minutosConSigno(inicio, fin!));
    parada.comentarioCierre = dto.comentarioCierre || null;
    await this.paradas.save(parada);
    await this.actualizarOrden(parada.ordenId, usuario);

    await this.audit.registrar({
      ordenId: parada.ordenId,
      tipo: 'parada',
      usuario,
      fecha: parada.fin!,
      texto: `${usuario.nombre} cerró la parada ${parada.inicio.slice(11, 16)} (${parada.duracionMin} min)`,
    });

    return enriquecerParada(parada, await this.lookups.load());
  }

  /* ---------------------------------------------------------------- */
  /* Detecciones IoT                                                   */
  /* ---------------------------------------------------------------- */

  async listarDetecciones(estado?: string): Promise<DeteccionDto[]> {
    const filas = await this.detecciones.find();
    return filas
      .filter((d) => (estado ? d.estado === estado : true))
      .sort((a, b) => b.detectadaEn.localeCompare(a.detectadaEn))
      .map((d) => this.toDeteccionDto(d));
  }

  /** Confirma la detección y crea la parada de origen `iot` vinculada. */
  async confirmarDeteccion(id: string, dto: ConfirmarDeteccionDto, usuario: AuthUser) {
    const deteccion = await this.detecciones.findOne({ where: { id } });
    if (!deteccion) throw new NoEncontradoException('Detección IoT');
    if (deteccion.estado !== 'sugerida') {
      throw new ConflictoException('La detección ya fue procesada', { estado: deteccion.estado });
    }
    assertAccesoLinea(usuario, deteccion.lineaId);

    const ordenAbierta = await this.orders.enCursoDeLinea(deteccion.lineaId);
    if (!ordenAbierta) {
      throw new ValidationException({
        lineaId: 'La línea no tiene una orden en curso a la que vincular la parada',
      });
    }

    /* `crear` valida causa, requisitos, horas y solapes, y marca la detección. */
    const parada = await this.crear(
      {
        ordenId: ordenAbierta.id,
        lineaId: deteccion.lineaId,
        causaId: dto.causaId,
        inicio: deteccion.detectadaEn,
        accionTomada: dto.accionTomada,
        numeroSolicitud: dto.numeroSolicitud,
        evidenciaUrl: dto.evidenciaUrl,
        responsableId: usuario.id,
        origen: 'iot',
        deteccionId: deteccion.id,
        tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
      },
      usuario,
    );
    const confirmada = (await this.detecciones.findOne({ where: { id } })) ?? deteccion;

    await this.audit.registrar({
      ordenId: parada.ordenId,
      tipo: 'sistema',
      usuario,
      texto: `Sistema vinculó la detección ${deteccion.id} a la parada ${parada.inicio.slice(11, 16)} · ${parada.causaCodigo} ${parada.causaNombre}`,
    });

    return { deteccion: this.toDeteccionDto(confirmada), parada };
  }

  async descartarDeteccion(id: string, usuario: AuthUser): Promise<DeteccionDto> {
    const deteccion = await this.detecciones.findOne({ where: { id } });
    if (!deteccion) throw new NoEncontradoException('Detección IoT');
    if (deteccion.estado !== 'sugerida') {
      throw new ConflictoException('La detección ya fue procesada', { estado: deteccion.estado });
    }
    assertAccesoLinea(usuario, deteccion.lineaId);
    deteccion.estado = 'descartada';
    await this.detecciones.save(deteccion);
    return this.toDeteccionDto(deteccion);
  }

  private toDeteccionDto(d: DeteccionIoT): DeteccionDto {
    return {
      ...d,
      paradaId: d.paradaId ?? undefined,
    };
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
