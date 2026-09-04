import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AuditEvent,
  Colaborador,
  MermaListItem,
  OrdenListItem,
  OrdenesResumen,
  Paginated,
  ParadaListItem,
  RegistroVelocidadListItem,
} from '@mes/types';
import { computeOee, rangoPeriodo } from '@mes/shared';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import {
  ConflictoException,
  NoEncontradoException,
  ValidationException,
} from '../../common/exceptions/business.exception';
import {
  enriquecerMerma,
  enriquecerOrden,
  enriquecerParada,
  enriquecerVelocidad,
} from '../../common/mappers/enrich';
import { LookupsService } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { ahoraIso, diaOperativo, normalizar, redondear, toList } from '../../common/utils/query';
import {
  Merma,
  OrdenFabricacion,
  Parada,
  RegistroVelocidad,
} from '../../database/entities';
import { colaboradoresBase } from '../../database/seeds/data/users';
import type { CreateOrdenDto, FinalizeOrdenDto, ValidateOrdenDto } from './dto/orden-mutations.dto';
import type { OrdenQueryDto } from './dto/orden-query.dto';

/** Total histórico del repositorio mostrado en la summary card «Todas» (spec 05.A). */
const TOTAL_HISTORICO_ORDENES = 1248;

/** Minutos de un turno completo, base del cálculo de disponibilidad. */
const MINUTOS_TURNO = 480;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(RegistroVelocidad) private readonly velocidades: Repository<RegistroVelocidad>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** Acepta id (`ORD-0815`) o código (`OF-2026-0815`). */
  async buscar(idOrCodigo: string): Promise<OrdenFabricacion> {
    const orden =
      (await this.ordenes.findOne({ where: { id: idOrCodigo } })) ??
      (await this.ordenes.findOne({ where: { codigo: idOrCodigo } }));
    if (!orden) throw new NoEncontradoException('Orden de fabricación');
    return orden;
  }

  async listar(query: OrdenQueryDto): Promise<Paginated<OrdenListItem>> {
    const lookups = await this.lookups.load();
    const lineaIds = toList(query.lineaId);
    const turnos = toList(query.turno);
    const estados = toList(query.estado);
    const search = normalizar(query.search ?? '');

    let items = await this.ordenes.find();

    /* `hoy`/`semana`/`mes` se anclan al día operativo (la fecha de las órdenes
     * vigentes), no al reloj del servidor: con el juego de datos congelado en
     * una fecha fija, `?periodo=hoy` devolvía siempre una lista vacía. */
    let rango: { desde: string; hasta: string } | null = null;
    if (query.desde && query.hasta) rango = { desde: query.desde, hasta: query.hasta };
    else if (query.periodo && query.periodo !== 'personalizado') {
      rango = rangoPeriodo(query.periodo, diaOperativo(items));
    }

    if (rango) items = items.filter((o) => o.fecha >= rango.desde && o.fecha <= rango.hasta);
    if (lineaIds.length > 0) items = items.filter((o) => lineaIds.includes(o.lineaId));
    if (turnos.length > 0) items = items.filter((o) => turnos.includes(o.turno));
    if (estados.length > 0) items = items.filter((o) => estados.includes(o.estado));
    if (search) {
      items = items.filter((o) => {
        const producto = lookups.productos.get(o.productoId)?.nombre ?? '';
        return (
          normalizar(o.codigo).includes(search) ||
          normalizar(o.lote).includes(search) ||
          normalizar(producto).includes(search)
        );
      });
    }

    const sort = query.sort ?? 'fecha';
    const dir = query.orden === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      if (sort === 'oee') return (a.oee.oee - b.oee.oee) * dir;
      if (sort === 'producido') return (a.producido - b.producido) * dir;
      if (sort === 'codigo') return a.codigo.localeCompare(b.codigo) * dir;
      const porFecha =
        a.fecha === b.fecha ? a.codigo.localeCompare(b.codigo) : a.fecha.localeCompare(b.fecha);
      return porFecha * dir;
    });

    return paginate(
      items.map((o) => enriquecerOrden(o, lookups)),
      query.page,
      query.pageSize,
    );
  }

  async resumen(): Promise<OrdenesResumen> {
    const items = await this.ordenes.find();
    return {
      todas: TOTAL_HISTORICO_ORDENES,
      porValidar: items.filter((o) => o.estado === 'por_validar').length,
      conParadas: items.filter((o) => o.paradasCount > 0).length,
      conMermas: items.filter((o) => o.mermasKg > 0).length,
      ultimaSincronizacion: ahoraIso(),
    };
  }

  async detalle(idOrCodigo: string): Promise<OrdenListItem> {
    const orden = await this.buscar(idOrCodigo);
    return enriquecerOrden(orden, await this.lookups.load());
  }

  async crear(dto: CreateOrdenDto, usuario: AuthUser): Promise<OrdenListItem> {
    const duplicada = await this.ordenes.findOne({ where: { codigo: dto.codigo } });
    if (duplicada) {
      throw new ConflictoException('Ya existe una orden con ese número', { codigo: dto.codigo });
    }
    const lookups = await this.lookups.load();
    const producto = lookups.productos.get(dto.productoId);

    /*
     * La velocidad estándar se resuelve del par producto × línea vigente y se
     * congela en u/min: si el par no existe (o está inactivo) la orden no puede
     * iniciarse, porque el OEE quedaría sin referencia de desempeño.
     */
    const par = LookupsService.parActivo(lookups, dto.productoId, dto.lineaId);
    if (!par) {
      throw new ValidationException({
        productoId: 'El producto no tiene velocidad estándar en esta línea',
      });
    }

    const colaboradorIds = dto.colaboradorIds ?? [];
    const colaboradores: Colaborador[] =
      colaboradorIds.length > 0
        ? colaboradoresBase.filter((c) => colaboradorIds.includes(c.id))
        : colaboradoresBase.slice(0, 4);

    const inicio = ahoraIso();
    const orden = this.ordenes.create({
      id: `ORD-${dto.codigo.slice(-4)}`,
      codigo: dto.codigo,
      fecha: inicio.slice(0, 10),
      lineaId: dto.lineaId,
      productoId: dto.productoId,
      turno: dto.turno,
      lote: dto.lote,
      vencimiento: dto.vencimiento,
      planificado: dto.planificado,
      producido: 0,
      conteoCodificadora: 0,
      velocidadEstandar: par.velocidadUnidMin,
      velocidadEstandarId: par.id,
      estado: 'en_curso',
      maquinistaId: dto.maquinistaId,
      supervisorId: dto.supervisorId,
      operarios: dto.operarios,
      colaboradores,
      oee: { oee: 0, disponibilidad: 0, desempeno: 0, calidad: 0 },
      paradasCount: 0,
      mermasKg: 0,
      inicio,
      fin: null,
      observacion: null,
    });
    await this.ordenes.save(orden);

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'creacion',
      usuario,
      fecha: inicio,
      texto: `${usuario.nombre} creó la orden ${orden.codigo} · ${producto?.nombre ?? ''} · ${orden.planificado} unidades`,
    });

    return enriquecerOrden(orden, await this.lookups.load());
  }

  async finalizar(
    idOrCodigo: string,
    dto: FinalizeOrdenDto,
    usuario: AuthUser,
  ): Promise<OrdenListItem> {
    const orden = await this.buscar(idOrCodigo);
    if (orden.estado !== 'en_curso') {
      throw new ConflictoException('La orden ya fue finalizada', { estado: orden.estado });
    }
    orden.producido = dto.producido;
    orden.conteoCodificadora = dto.conteoCodificadora;
    orden.fin = ahoraIso();
    orden.estado = 'por_validar';
    if (dto.comentario) orden.observacion = dto.comentario;
    await this.recalcular(orden);
    await this.ordenes.save(orden);

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'sistema',
      usuario,
      fecha: orden.fin,
      texto: `${usuario.nombre} finalizó la orden con ${orden.producido} unidades (conteo codificadora ${orden.conteoCodificadora})`,
    });

    this.emitirTri({
      tipo: 'orden',
      segundos: dto.tiempoRegistroSeg ?? 0,
      usuarioId: usuario.id,
      fecha: orden.fin.slice(0, 10),
      referenciaId: orden.id,
      descripcion: `Cierre de ${orden.codigo}`,
    });

    return enriquecerOrden(orden, await this.lookups.load());
  }

  async validar(
    idOrCodigo: string,
    dto: ValidateOrdenDto,
    usuario: AuthUser,
  ): Promise<OrdenListItem> {
    const orden = await this.buscar(idOrCodigo);
    if (orden.estado === 'validada') {
      throw new ConflictoException('La orden ya está validada', { estado: orden.estado });
    }
    if (orden.estado === 'en_curso') {
      throw new ConflictoException('No se puede validar una orden en curso', {
        estado: orden.estado,
      });
    }
    orden.estado = 'validada';
    if (dto.observacion) orden.observacion = dto.observacion;
    await this.recalcular(orden);
    await this.ordenes.save(orden);

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'validacion',
      usuario,
      texto: `${usuario.nombre} validó y cerró la orden${dto.observacion ? ` · ${dto.observacion}` : ''}`,
    });

    return enriquecerOrden(orden, await this.lookups.load());
  }

  async paradasDe(idOrCodigo: string) {
    const orden = await this.buscar(idOrCodigo);
    const lookups = await this.lookups.load();
    const filas = (await this.paradas.find({ where: { ordenId: orden.id } })).sort((a, b) =>
      a.inicio.localeCompare(b.inicio),
    );
    const data: ParadaListItem[] = filas.map((p) => enriquecerParada(p, lookups));
    return {
      data,
      resumen: {
        cantidad: data.length,
        minutos: data.reduce((acc, p) => acc + p.duracionMin, 0),
        afectanOee: data.filter((p) => p.afectaOee).length,
      },
    };
  }

  async mermasDe(idOrCodigo: string) {
    const orden = await this.buscar(idOrCodigo);
    const lookups = await this.lookups.load();
    const filas = (await this.mermas.find({ where: { ordenId: orden.id } })).sort((a, b) =>
      a.registradaEn.localeCompare(b.registradaEn),
    );
    const data: MermaListItem[] = filas.map((m) => enriquecerMerma(m, lookups));
    return {
      data,
      resumen: {
        cantidad: data.length,
        kg: redondear(
          data.reduce((acc, m) => acc + m.cantidadKg, 0),
          2,
        ),
      },
    };
  }

  async velocidadesDe(idOrCodigo: string): Promise<{ data: RegistroVelocidadListItem[] }> {
    const orden = await this.buscar(idOrCodigo);
    const lookups = await this.lookups.load();
    const filas = (await this.velocidades.find({ where: { ordenId: orden.id } })).sort((a, b) =>
      a.registradaEn.localeCompare(b.registradaEn),
    );
    return { data: filas.map((v) => enriquecerVelocidad(v, lookups)) };
  }

  async bitacoraDe(idOrCodigo: string, tipo?: string | string[]): Promise<{ data: AuditEvent[] }> {
    const orden = await this.buscar(idOrCodigo);
    return { data: await this.audit.porOrden(orden.id, toList(tipo)) };
  }

  /** Recalcula OEE, nº de paradas y kg de merma a partir de los registros vivos. */
  async recalcular(orden: OrdenFabricacion): Promise<void> {
    const [paradas, mermas] = await Promise.all([
      this.paradas.find({ where: { ordenId: orden.id } }),
      this.mermas.find({ where: { ordenId: orden.id } }),
    ]);
    const paradasMin = paradas
      .filter((p) => p.afectaOee)
      .reduce((acc, p) => acc + p.duracionMin, 0);

    orden.paradasCount = paradas.length;
    orden.mermasKg = redondear(mermas.reduce((acc, m) => acc + m.cantidadKg, 0));
    orden.oee = computeOee({
      tiempoPlanificadoMin: MINUTOS_TURNO,
      paradasMin,
      unidadesProducidas: orden.producido,
      unidadesBuenas: orden.conteoCodificadora,
      velocidadEstandar: orden.velocidadEstandar,
    });
  }

  /** Persiste la orden tras un recálculo disparado por otro módulo. */
  async guardar(orden: OrdenFabricacion): Promise<OrdenFabricacion> {
    return this.ordenes.save(orden);
  }

  /** Orden `en_curso` más reciente de una línea; `null` si la línea está libre. */
  async enCursoDeLinea(lineaId: string): Promise<OrdenFabricacion | null> {
    const abiertas = await this.ordenes.find({ where: { lineaId, estado: 'en_curso' } });
    return abiertas.sort((a, b) => b.inicio.localeCompare(a.inicio))[0] ?? null;
  }

  emitirTri(evento: TriRegistroEvent): void {
    this.events.emit(TRI_REGISTRO_EVENT, evento);
  }
}
