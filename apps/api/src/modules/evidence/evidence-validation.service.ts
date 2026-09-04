import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { METAS_TESIS, calcTci, estadoTci } from '@mes/shared';
import { TIPOS_REGISTRO_TCI } from '@mes/types';
import type {
  ClaveCriterioTci,
  CriterioTCI,
  EvaluacionTCI,
  EvidenciaTCI,
  ListadoTCI,
  ResumenPorTipoTCI,
  ResumenTCI,
  TipoRegistroTci,
} from '@mes/types';
import { NoEncontradoException } from '../../common/exceptions';
import { LookupsService, type Lookups } from '../../common/mappers';
import { ahoraIso, hoyIso, paginate } from '../../common/utils';
import {
  EvaluacionCalidad,
  LecturaSensor,
  Merma,
  OrdenFabricacion,
  Parada,
  RegistroTiempo,
  RegistroVelocidad,
  SolicitudExterna,
  TransferenciaSap,
  Umbrales,
} from '../../database/entities';
import { EvidenceImportService } from './evidence-import.service';
import {
  CRITERIOS_POR_TIPO,
  aplicarOverrides,
  construirTramos,
  criterioCompleto,
  criterioSapMerma,
  criterioSensorParada,
  criterioSensorVelocidad,
  criterioSolicitud,
  esValido,
  num,
  turnoDe,
  type LecturaSensorPlana,
  type ToleranciasTci,
  type TramoSensor,
} from './evidence.rules';
import type { OverrideTciDto, TciQueryDto, ValidarTciDto } from './dto/evidence.dto';

const UMBRALES_ID = 'UMB-01';

/**
 * Motor de validación de la calidad de la información (Anexo 03).
 * Recorre paradas, mermas y registros de velocidad de un rango y contrasta cada
 * uno con las fuentes externas importadas (sensores, solicitudes, SAP).
 */
@Injectable()
export class EvidenceValidationService {
  constructor(
    @InjectRepository(EvaluacionCalidad) private readonly calidad: Repository<EvaluacionCalidad>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(RegistroVelocidad) private readonly velocidades: Repository<RegistroVelocidad>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(RegistroTiempo) private readonly tiempos: Repository<RegistroTiempo>,
    @InjectRepository(LecturaSensor) private readonly lecturas: Repository<LecturaSensor>,
    @InjectRepository(SolicitudExterna) private readonly solicitudes: Repository<SolicitudExterna>,
    @InjectRepository(TransferenciaSap) private readonly transferencias: Repository<TransferenciaSap>,
    @InjectRepository(Umbrales) private readonly umbrales: Repository<Umbrales>,
    private readonly lookups: LookupsService,
    private readonly fuentes: EvidenceImportService,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Validación                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Reevalúa el rango indicado y reemplaza sus filas del Anexo 03,
   * conservando los overrides que el usuario haya puesto por registro.
   */
  async validar(dto: ValidarTciDto): Promise<EvidenciaTCI> {
    const tipos = dto.tipos?.length ? dto.tipos : [...TIPOS_REGISTRO_TCI];
    const desde = dto.desde ?? (await this.primerDiaPostest());
    const hasta = dto.hasta ?? hoyIso();
    const validadoEn = ahoraIso();

    const [tolerancias, lookups] = await Promise.all([this.tolerancias(), this.lookups.load()]);
    const contexto = await this.cargarFuentes();
    const previas = await this.calidad.find();
    const overridesPrevios = new Map(previas.map((p) => [p.id, p.overrides]));
    const observacionesPrevias = new Map(previas.map((p) => [p.id, p.observacion]));

    const nuevas: EvaluacionCalidad[] = [];
    if (tipos.includes('parada')) {
      nuevas.push(...(await this.evaluarParadas(desde, hasta, lookups, contexto, tolerancias)));
    }
    if (tipos.includes('merma')) {
      nuevas.push(...(await this.evaluarMermas(desde, hasta, lookups, contexto, tolerancias)));
    }
    if (tipos.includes('velocidad')) {
      nuevas.push(...(await this.evaluarVelocidades(desde, hasta, lookups, contexto, tolerancias)));
    }

    for (const fila of nuevas) {
      fila.desde = desde;
      fila.hasta = hasta;
      fila.validadoEn = validadoEn;
      fila.overrides = overridesPrevios.get(fila.id) ?? null;
      fila.observacion = observacionesPrevias.get(fila.id) ?? '';
      fila.valido = esValido(aplicarOverrides(fila.criterios, fila.overrides));
    }

    /* Se reemplazan sólo las evaluaciones del rango y de los tipos pedidos. */
    const aBorrar = previas.filter(
      (p) => tipos.includes(p.tipoRegistro) && p.fecha >= desde && p.fecha <= hasta,
    );
    if (aBorrar.length > 0) {
      await this.calidad.delete({ id: In(aBorrar.map((p) => p.id)) });
    }
    if (nuevas.length > 0) await this.calidad.save(nuevas, { chunk: 200 });
    await this.renumerar();

    return this.evidencia();
  }

  /** Primer día con una captura real del postest; hoy si aún no hay ninguna. */
  private async primerDiaPostest(): Promise<string> {
    const [primera] = await this.tiempos.find({
      where: { etapa: 'postest' },
      order: { fecha: 'ASC' },
      take: 1,
    });
    return primera?.fecha ?? hoyIso();
  }

  private async tolerancias(): Promise<ToleranciasTci> {
    const fila = await this.umbrales.findOne({ where: { id: UMBRALES_ID } });
    return {
      minutos: fila?.tciToleranciaMin ?? 5,
      pct: fila?.tciToleranciaPct ?? 5,
      diasSap: fila?.tciToleranciaDiasSap ?? 1,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Fuentes externas cargadas en memoria                              */
  /* ---------------------------------------------------------------- */

  private async cargarFuentes(): Promise<ContextoValidacion> {
    const [lecturas, solicitudes, transferencias, ultimaSolicitudes] = await Promise.all([
      this.lecturas.find(),
      this.solicitudes.find(),
      this.transferencias.find(),
      this.fuentes.ultimaImportacion('solicitudes'),
    ]);

    const porLinea = new Map<string, LecturaSensorPlana[]>();
    for (const l of lecturas) {
      const lista = porLinea.get(l.lineaId) ?? [];
      lista.push({ fechaHora: l.fechaHora, estado: l.estado, velocidadUnidMin: l.velocidadUnidMin });
      porLinea.set(l.lineaId, lista);
    }
    const tramosPorLinea = new Map<string, TramoSensor[]>();
    for (const [lineaId, lista] of porLinea) tramosPorLinea.set(lineaId, construirTramos(lista));

    const sapPorLinea = new Map<string, TransferenciaSap[]>();
    for (const t of transferencias) {
      const lista = sapPorLinea.get(t.lineaId) ?? [];
      lista.push(t);
      sapPorLinea.set(t.lineaId, lista);
    }

    return {
      lecturasPorLinea: porLinea,
      tramosPorLinea,
      solicitudes: new Map(solicitudes.map((s) => [s.numero.trim().toUpperCase(), s])),
      sapPorLinea,
      fechaImportacionSolicitudes: ultimaSolicitudes?.fecha ?? null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Evaluación por tipo de registro                                   */
  /* ---------------------------------------------------------------- */

  private async evaluarParadas(
    desde: string,
    hasta: string,
    lookups: Lookups,
    ctx: ContextoValidacion,
    tol: ToleranciasTci,
  ): Promise<EvaluacionCalidad[]> {
    const filas = await this.paradas.find({
      where: { inicio: Between(`${desde}T00:00:00`, `${hasta}T23:59:59`) },
      order: { inicio: 'ASC' },
    });

    return filas.map((p) => {
      const linea = lookups.lineas.get(p.lineaId);
      const causa = lookups.causasParada.get(p.causaId);
      const dia = p.inicio.slice(0, 10);
      const lineaCodigo = linea?.codigo ?? p.lineaId;

      const completo = criterioCompleto([
        ['orden', Boolean(p.ordenId)],
        ['línea', Boolean(p.lineaId)],
        ['causa de último nivel', causa?.nivel === 'especifica'],
        ['acción tomada', (p.accionTomada ?? '').trim().length > 0],
        ['responsable', Boolean(p.responsableId)],
        ['duración mayor que 0', p.duracionMin > 0],
      ]);

      const tramosDelDia = (ctx.tramosPorLinea.get(p.lineaId) ?? []).filter(
        (t) => t.desde.slice(0, 10) === dia || t.hasta.slice(0, 10) === dia,
      );
      const sensor = criterioSensorParada(
        { inicio: p.inicio, fin: p.fin, lineaCodigo },
        tramosDelDia,
        tol,
      );

      const numero = p.numeroSolicitud?.trim() || null;
      const encontrada = numero ? (ctx.solicitudes.get(numero.toUpperCase()) ?? null) : null;
      const solicitud = criterioSolicitud(
        Boolean(causa?.requiereSolicitud),
        causa?.codigo ?? p.causaId,
        numero,
        encontrada,
        ctx.fechaImportacionSolicitudes,
      );

      const rango = p.fin ? `${p.inicio.slice(11, 16)}–${p.fin.slice(11, 16)}` : `${p.inicio.slice(11, 16)}–abierta`;
      return this.crearFila({
        registroId: p.id,
        tipoRegistro: 'parada',
        fecha: dia,
        turno: turnoDe(p.inicio),
        lineaId: p.lineaId,
        lineaCodigo,
        referencia: `${rango} · ${causa?.codigo ?? p.causaId} · ${p.duracionMin} min`,
        criterios: [completo, sensor, solicitud],
      });
    });
  }

  private async evaluarMermas(
    desde: string,
    hasta: string,
    lookups: Lookups,
    ctx: ContextoValidacion,
    tol: ToleranciasTci,
  ): Promise<EvaluacionCalidad[]> {
    const filas = await this.mermas.find({
      where: { registradaEn: Between(`${desde}T00:00:00`, `${hasta}T23:59:59`) },
      order: { registradaEn: 'ASC' },
    });
    if (filas.length === 0) return [];

    const ordenes = await this.ordenes.find({
      where: { id: In([...new Set(filas.map((m) => m.ordenId))]) },
      select: { id: true, productoId: true },
    });
    const productoPorOrden = new Map(ordenes.map((o) => [o.id, o.productoId]));

    return filas.map((m) => {
      const linea = lookups.lineas.get(m.lineaId);
      const causa = lookups.causasMerma.get(m.causaId);
      const dia = m.registradaEn.slice(0, 10);
      const lineaCodigo = linea?.codigo ?? m.lineaId;
      const productoId = productoPorOrden.get(m.ordenId);
      const productoCodigo = productoId ? (lookups.productos.get(productoId)?.codigo ?? null) : null;

      const completo = criterioCompleto([
        ['orden', Boolean(m.ordenId)],
        ['línea', Boolean(m.lineaId)],
        ['tipo de merma', Boolean(m.tipo)],
        ['causa de último nivel', causa?.nivel === 'causa'],
        ['cantidad mayor que 0', m.cantidadKg > 0],
        ['responsable', Boolean(m.responsableId)],
        ...(causa?.requiereComentario
          ? ([['observación', (m.observacion ?? '').trim().length > 0]] as [string, boolean][])
          : []),
      ]);

      const sap = criterioSapMerma(
        { fecha: dia, cantidadKg: m.cantidadKg, lineaCodigo },
        productoCodigo,
        ctx.sapPorLinea.get(m.lineaId) ?? [],
        tol,
      );

      const numero = m.numeroSolicitud?.trim() || null;
      const encontrada = numero ? (ctx.solicitudes.get(numero.toUpperCase()) ?? null) : null;
      const solicitud = criterioSolicitud(
        Boolean(causa?.requiereSolicitud),
        causa?.codigo ?? m.causaId,
        numero,
        encontrada,
        ctx.fechaImportacionSolicitudes,
      );

      return this.crearFila({
        registroId: m.id,
        tipoRegistro: 'merma',
        fecha: dia,
        turno: turnoDe(m.registradaEn),
        lineaId: m.lineaId,
        lineaCodigo,
        referencia: `${m.tipo} ${num(m.cantidadKg)} kg · ${causa?.codigo ?? m.causaId}`,
        criterios: [completo, sap, solicitud],
      });
    });
  }

  private async evaluarVelocidades(
    desde: string,
    hasta: string,
    lookups: Lookups,
    ctx: ContextoValidacion,
    tol: ToleranciasTci,
  ): Promise<EvaluacionCalidad[]> {
    const filas = await this.velocidades.find({
      where: { registradaEn: Between(`${desde}T00:00:00`, `${hasta}T23:59:59`) },
      order: { registradaEn: 'ASC' },
    });

    return filas.map((v) => {
      const linea = lookups.lineas.get(v.lineaId);
      const lineaCodigo = linea?.codigo ?? v.lineaId;

      const completo = criterioCompleto([
        ['orden', Boolean(v.ordenId)],
        ['línea', Boolean(v.lineaId)],
        ['velocidad real mayor que 0', v.velocidadReal > 0],
        ['velocidad estándar', v.velocidadEstandar > 0],
        ['responsable', Boolean(v.responsableId)],
      ]);

      const sensor = criterioSensorVelocidad(
        { registradaEn: v.registradaEn, velocidadReal: v.velocidadReal, lineaCodigo },
        ctx.lecturasPorLinea.get(v.lineaId) ?? [],
        tol,
      );

      return this.crearFila({
        registroId: v.id,
        tipoRegistro: 'velocidad',
        fecha: v.registradaEn.slice(0, 10),
        turno: turnoDe(v.registradaEn),
        lineaId: v.lineaId,
        lineaCodigo,
        referencia: `${num(v.velocidadReal)} u/min (estándar ${num(v.velocidadEstandar)})`,
        criterios: [completo, sensor],
      });
    });
  }

  private crearFila(datos: Omit<EvaluacionCalidad, 'n' | 'valido' | 'validadoEn' | 'desde' | 'hasta' | 'observacion' | 'overrides' | 'id'>): EvaluacionCalidad {
    return this.calidad.create({
      ...datos,
      id: `TCI-${datos.registroId}`,
      n: 0,
      valido: false,
      validadoEn: '',
      desde: '',
      hasta: '',
      overrides: null,
      observacion: '',
    });
  }

  /** Renumera `n` por fecha y tipo para que la ficha del Anexo 03 sea estable. */
  private async renumerar(): Promise<void> {
    const filas = await this.calidad.find();
    filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    filas.forEach((f, i) => {
      f.n = i + 1;
    });
    if (filas.length > 0) await this.calidad.save(filas, { chunk: 200 });
  }

  /* ---------------------------------------------------------------- */
  /* Lectura                                                           */
  /* ---------------------------------------------------------------- */

  /** Evidencia completa del Anexo 03 (todas las evaluaciones). */
  async evidencia(): Promise<EvidenciaTCI> {
    const filas = await this.calidad.find({ order: { n: 'ASC' } });
    const registros = filas.map((f) => this.aEvaluacion(f));
    return { ...(await this.resumen(filas)), registros };
  }

  /** Página de evaluaciones con filtros + cabecera del KPI. */
  async listar(query: TciQueryDto): Promise<ListadoTCI> {
    const todas = await this.calidad.find({ order: { n: 'ASC' } });
    const registros = todas.map((f) => this.aEvaluacion(f));

    const tipos = query.tipo ? (Array.isArray(query.tipo) ? query.tipo : [query.tipo]) : [];
    const filtrados = registros.filter((r) => {
      if (tipos.length > 0 && !tipos.includes(r.tipoRegistro)) return false;
      if (query.resultado === 'valido' && !r.valido) return false;
      if (query.resultado === 'invalido' && r.valido) return false;
      if (query.desde && r.fecha < query.desde) return false;
      if (query.hasta && r.fecha > query.hasta) return false;
      return true;
    });

    const pagina = paginate(filtrados, query.page, query.pageSize);
    return { ...pagina, resumen: await this.resumen(todas) };
  }

  /** Sobrescribe manualmente los criterios de una evaluación (vista 09.C). */
  async override(
    id: string,
    dto: OverrideTciDto,
  ): Promise<{ item: EvaluacionTCI; resumen: ResumenTCI }> {
    const fila = await this.calidad.findOne({ where: { id } });
    if (!fila) throw new NoEncontradoException('Evaluación de calidad');

    const overrides: Partial<Record<ClaveCriterioTci, boolean>> = { ...(fila.overrides ?? {}) };
    for (const [clave, valor] of Object.entries(dto.overrides ?? {})) {
      /* `null` devuelve el criterio al resultado de la regla. */
      if (valor === null || valor === undefined) delete overrides[clave as ClaveCriterioTci];
      else overrides[clave as ClaveCriterioTci] = valor;
    }
    fila.overrides = Object.keys(overrides).length > 0 ? overrides : null;
    if (dto.observacion !== undefined) fila.observacion = dto.observacion;
    fila.valido = esValido(aplicarOverrides(fila.criterios, fila.overrides));
    await this.calidad.save(fila);

    return { item: this.aEvaluacion(fila), resumen: await this.resumen() };
  }

  /** Cabecera del KPI: totales, desglose por tipo, última corrida y fuentes. */
  async resumen(filas?: EvaluacionCalidad[]): Promise<ResumenTCI> {
    const todas = filas ?? (await this.calidad.find());
    const evaluadas = todas.map((f) => ({
      tipo: f.tipoRegistro,
      valido: esValido(aplicarOverrides(f.criterios, f.overrides)),
    }));

    const porTipo = Object.fromEntries(
      TIPOS_REGISTRO_TCI.map((tipo): [TipoRegistroTci, ResumenPorTipoTCI] => {
        const delTipo = evaluadas.filter((e) => e.tipo === tipo);
        return [tipo, { correctos: delTipo.filter((e) => e.valido).length, totales: delTipo.length }];
      }),
    ) as Record<TipoRegistroTci, ResumenPorTipoTCI>;

    const registrosCorrectos = evaluadas.filter((e) => e.valido).length;
    const porcentaje = calcTci(registrosCorrectos, evaluadas.length);

    const ultima = todas.reduce<EvaluacionCalidad | null>(
      (mejor, f) => (!mejor || f.validadoEn > mejor.validadoEn ? f : mejor),
      null,
    );

    return {
      registrosCorrectos,
      registrosTotales: evaluadas.length,
      porcentaje,
      meta: `≥ ${METAS_TESIS.TCI_PCT} %`,
      estado: estadoTci(porcentaje),
      porTipo,
      ...(ultima && ultima.validadoEn
        ? {
            ultimaValidacion: {
              fecha: ultima.validadoEn,
              desde: ultima.desde,
              hasta: ultima.hasta,
              evaluados: todas.filter((f) => f.validadoEn === ultima.validadoEn).length,
            },
          }
        : {}),
      fuentes: await this.fuentes.fuentes(),
    };
  }

  private aEvaluacion(f: EvaluacionCalidad): EvaluacionTCI {
    const criterios: CriterioTCI[] = aplicarOverrides(f.criterios, f.overrides);
    return {
      id: f.id,
      n: f.n,
      fecha: f.fecha,
      turno: f.turno,
      tipoRegistro: f.tipoRegistro,
      registroId: f.registroId,
      lineaId: f.lineaId,
      lineaCodigo: f.lineaCodigo,
      referencia: f.referencia,
      criterios: criterios.filter((c) => CRITERIOS_POR_TIPO[f.tipoRegistro].includes(c.clave)),
      valido: esValido(criterios),
      ...(f.observacion ? { observacion: f.observacion } : {}),
      validadoEn: f.validadoEn,
      ...(f.overrides ? { overrides: f.overrides } : {}),
    };
  }
}

interface ContextoValidacion {
  lecturasPorLinea: Map<string, LecturaSensorPlana[]>;
  tramosPorLinea: Map<string, TramoSensor[]>;
  /** N.º de solicitud en mayúsculas → solicitud importada. */
  solicitudes: Map<string, SolicitudExterna>;
  sapPorLinea: Map<string, TransferenciaSap[]>;
  /** ISO de la última importación de solicitudes, para el motivo del rechazo. */
  fechaImportacionSolicitudes: string | null;
}
