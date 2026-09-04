import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  DeteccionIoT as DeteccionDto,
  Paginated,
  ParadaListItem,
} from '@mes/types';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import {
  ConflictoException,
  NoEncontradoException,
  ValidationException,
} from '../../common/exceptions/business.exception';
import { enriquecerParada, tipoDeCausa } from '../../common/mappers/enrich';
import { LookupsService } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { minutosEntreIso, toList } from '../../common/utils/query';
import { DeteccionIoT, Parada } from '../../database/entities';
import { OrdersService } from '../orders/orders.service';
import type {
  ConfirmarDeteccionDto,
  CreateParadaDto,
  FinalizeParadaDto,
  ParadaQueryDto,
  UpdateParadaDto,
} from './dto/parada.dto';

@Injectable()
export class DowntimesService {
  constructor(
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(DeteccionIoT) private readonly detecciones: Repository<DeteccionIoT>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
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

  async crear(dto: CreateParadaDto, usuario: AuthUser): Promise<ParadaListItem> {
    const lookups = await this.lookups.load();
    /* La parada se registra hasta la línea: no existe nivel máquina. */
    if (!lookups.lineas.has(dto.lineaId)) {
      throw new ValidationException({ lineaId: 'La línea seleccionada no existe' });
    }
    const causa = lookups.causasParada.get(dto.causaId);
    if (!causa) {
      throw new ValidationException({ causaId: 'La causa seleccionada no existe' });
    }
    if (causa.estado === 'inactivo') {
      throw new ValidationException({ causaId: 'La causa está dada de baja' });
    }
    if (causa.requiereSolicitud && !dto.numeroSolicitud) {
      throw new ValidationException({
        numeroSolicitud: `La causa ${causa.codigo} exige el número de solicitud de mantenimiento`,
      });
    }
    const orden = await this.orders.buscar(dto.ordenId);

    const tipo = tipoDeCausa(lookups, causa.id);
    const total = await this.paradas.count();
    const parada = this.paradas.create({
      id: `PAR-${orden.id.slice(4)}-N${total + 1}`,
      ordenId: orden.id,
      lineaId: dto.lineaId,
      causaId: causa.id,
      tipoCausaId: dto.tipoCausaId ?? tipo?.id ?? causa.id,
      inicio: dto.inicio,
      fin: null,
      duracionMin: 0,
      accionTomada: dto.accionTomada,
      numeroSolicitud: dto.numeroSolicitud ?? null,
      evidenciaUrl: dto.evidenciaUrl ?? null,
      afectaOee: dto.afectaOee ?? causa.afectaOee,
      responsableId: dto.responsableId,
      origen: dto.origen ?? 'manual',
      deteccionId: dto.deteccionId ?? null,
      tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
      comentarioCierre: null,
    });
    await this.paradas.save(parada);
    await this.actualizarOrden(orden.id);

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
    const lookups = await this.lookups.load();

    const cambios: string[] = [];
    if (dto.causaId && dto.causaId !== parada.causaId) {
      const nueva = lookups.causasParada.get(dto.causaId);
      if (!nueva) throw new ValidationException({ causaId: 'La causa seleccionada no existe' });
      const anterior = lookups.causasParada.get(parada.causaId);
      cambios.push(`causa: ${anterior?.codigo ?? parada.causaId} → ${nueva.codigo}`);
      parada.causaId = nueva.id;
      parada.tipoCausaId = tipoDeCausa(lookups, nueva.id)?.id ?? nueva.id;
      parada.afectaOee = dto.afectaOee ?? nueva.afectaOee;
    }
    if (dto.accionTomada && dto.accionTomada !== parada.accionTomada) {
      cambios.push('acción tomada actualizada');
      parada.accionTomada = dto.accionTomada;
    }
    if (dto.inicio && dto.inicio !== parada.inicio) {
      cambios.push(`inicio: ${parada.inicio.slice(11, 16)} → ${dto.inicio.slice(11, 16)}`);
      parada.inicio = dto.inicio;
      if (parada.fin) parada.duracionMin = minutosEntreIso(parada.inicio, parada.fin);
    }
    if (dto.fin !== undefined) {
      const finAnterior = parada.fin;
      parada.fin = dto.fin ?? null;
      parada.duracionMin = parada.fin ? minutosEntreIso(parada.inicio, parada.fin) : 0;
      if (finAnterior !== parada.fin) {
        cambios.push(
          `fin: ${finAnterior ? finAnterior.slice(11, 16) : 'abierta'} → ${parada.fin ? parada.fin.slice(11, 16) : 'abierta'}`,
        );
      }
    }
    if (dto.numeroSolicitud !== undefined) parada.numeroSolicitud = dto.numeroSolicitud ?? null;
    if (dto.evidenciaUrl !== undefined) parada.evidenciaUrl = dto.evidenciaUrl ?? null;
    if (dto.responsableId) parada.responsableId = dto.responsableId;
    if (dto.afectaOee !== undefined) parada.afectaOee = dto.afectaOee;

    await this.paradas.save(parada);
    await this.actualizarOrden(parada.ordenId);

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
    parada.fin = dto.fin;
    parada.duracionMin = minutosEntreIso(parada.inicio, dto.fin);
    parada.comentarioCierre = dto.comentarioCierre ?? null;
    await this.paradas.save(parada);
    await this.actualizarOrden(parada.ordenId);

    await this.audit.registrar({
      ordenId: parada.ordenId,
      tipo: 'parada',
      usuario,
      fecha: parada.fin,
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

    const ordenAbierta = await this.orders.enCursoDeLinea(deteccion.lineaId);
    if (!ordenAbierta) {
      throw new ValidationException({
        lineaId: 'La línea no tiene una orden en curso a la que vincular la parada',
      });
    }

    const parada = await this.crear(
      {
        ordenId: ordenAbierta.id,
        lineaId: deteccion.lineaId,
        causaId: dto.causaId,
        inicio: deteccion.detectadaEn,
        accionTomada: dto.accionTomada,
        responsableId: usuario.id,
        origen: 'iot',
        deteccionId: deteccion.id,
        tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
      },
      usuario,
    );

    deteccion.estado = 'confirmada';
    deteccion.paradaId = parada.id;
    await this.detecciones.save(deteccion);

    await this.audit.registrar({
      ordenId: parada.ordenId,
      tipo: 'sistema',
      usuario,
      texto: `Sistema vinculó la detección ${deteccion.id} a la parada ${parada.inicio.slice(11, 16)} · ${parada.causaCodigo} ${parada.causaNombre}`,
    });

    return { deteccion: this.toDeteccionDto(deteccion), parada };
  }

  async descartarDeteccion(id: string): Promise<DeteccionDto> {
    const deteccion = await this.detecciones.findOne({ where: { id } });
    if (!deteccion) throw new NoEncontradoException('Detección IoT');
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

  private async actualizarOrden(ordenId: string): Promise<void> {
    const orden = await this.orders.buscar(ordenId);
    await this.orders.recalcular(orden);
    await this.orders.guardar(orden);
  }

  private emitirTri(evento: TriRegistroEvent): void {
    this.events.emit(TRI_REGISTRO_EVENT, evento);
  }
}
