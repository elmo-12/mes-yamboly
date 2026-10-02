import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type {
  ComparativaTurno,
  DetalleCausaMerma,
  DetalleCausaParada,
  DonutSegmento,
  HeatmapCelda,
  IndicadoresResumen,
  KpiValor,
  MermaApiladaLinea,
  MermasResumen,
  OeePorLinea,
  ParadasResumen,
  ParetoParada,
  Periodo,
  TendenciaOeePunto,
  TipoMermaCodigo,
  Turno,
} from '@mes/types';
import { TURNO_LABEL, TURNOS } from '@mes/types';
import {
  CausaMerma,
  CausaParada,
  IndicadorDiario,
  Linea,
  Merma,
  OrdenFabricacion,
  Parada,
  ParadaAgregada,
  Producto,
} from '../../database/entities';
import type { CategoriaParada } from '../../database/entities/parada-agregada.entity';
import { META_OEE } from '@mes/shared';
import { ValidationException } from '../../common/exceptions';
import { diaOperativo, sumarDiasLocal } from '../../common/utils';
import { agregarVentana, nuevoAcumulado, oeeDe, type AgregadoVentana } from './reports-oee';
import {
  erroresDeRango,
  etiquetaFecha,
  redondear,
  restarAnio,
  sumarDias,
  toList,
} from './reports.util';
import type { PeriodoReporte, ReporteQueryDto } from './dto/reporte-query.dto';

/** Días que abarca cada periodo del selector de Reportes. */
const DIAS_POR_PERIODO: Record<PeriodoReporte, number> = {
  hoy: 1,
  semana: 7,
  '7d': 7,
  mes: 30,
  trimestre: 90,
  personalizado: 7,
  custom: 7,
};

const PERIODO_CANONICO: Record<PeriodoReporte, Periodo> = {
  hoy: 'hoy',
  semana: 'semana',
  '7d': 'semana',
  mes: 'mes',
  trimestre: 'trimestre',
  personalizado: 'personalizado',
  custom: 'personalizado',
};

interface Ventana {
  periodo: Periodo;
  desde: string;
  hasta: string;
  dias: number;
}

/** Coste con el que se valoriza la merma (S/ por kg); mismo valor que la sincronización. */
const COSTO_MERMA_SOL_KG = Number(process.env.COSTO_MERMA_SOL_KG) || 9.5;

const ETIQUETA_CATEGORIA: Record<CategoriaParada, string> = {
  rutinarias: 'Rutinarias',
  imprevistas: 'Imprevistas',
  fallas: 'Fallas',
};

/** Categoría del donut según el tipo raíz de la causa (mismo criterio que la sincronización). */
function categoriaDeTipo(tipo: CausaParada | undefined): CategoriaParada {
  if (!tipo) return 'imprevistas';
  if (tipo.clasificacion === 'programada') return 'rutinarias';
  return /falla/i.test(tipo.nombre) ? 'fallas' : 'imprevistas';
}

/** Filtros comunes de Paradas y Mermas: ventana, líneas y turnos. */
interface FiltroHechos {
  desde: string;
  hasta: string;
  lineaIds: string[];
  turnos: Turno[];
}

function lineaTop(mapa: Map<string, number>, codigo: (id: string) => string): string {
  const top = [...mapa.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? codigo(top) : '—';
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(IndicadorDiario) private readonly diarios: Repository<IndicadorDiario>,
    @InjectRepository(ParadaAgregada) private readonly paradas: Repository<ParadaAgregada>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradasCrudas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermasCrudas: Repository<Merma>,
    @InjectRepository(CausaParada) private readonly causasParada: Repository<CausaParada>,
    @InjectRepository(CausaMerma) private readonly causasMerma: Repository<CausaMerma>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
    @InjectRepository(Linea) private readonly catalogoLineas: Repository<Linea>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 06.A — Indicadores                                                */
  /* ---------------------------------------------------------------- */

  async indicadores(query: ReporteQueryDto): Promise<IndicadoresResumen> {
    const ventana = await this.resolverVentana(query);
    const lineaIds = toList(query.lineaId);
    const turnosFiltro = toList(query.turno) as Turno[];

    /* Se calcula sobre las órdenes y paradas de la ventana, no sobre las tablas
     * pre-agregadas: son una foto sin periodo y hacían que el Home enseñara las
     * 9 líneas del mes bajo el título «turno actual». */
    const [ordenes, paradas] = await Promise.all([
      this.ordenes.find(),
      this.paradasCrudas.find(),
    ]);
    const opciones = { lineaIds, turnos: turnosFiltro };
    const actual = agregarVentana(ordenes, paradas, {
      desde: ventana.desde,
      hasta: ventana.hasta,
      ...opciones,
    });
    const previa = this.ventanaComparacion(ventana, query.comparar);
    const anterior = agregarVentana(ordenes, paradas, { ...previa, ...opciones });

    return {
      periodo: ventana.periodo,
      desde: ventana.desde,
      hasta: ventana.hasta,
      kpis: this.kpisDeVentana(actual, anterior, query.comparar),
      tendenciaOee: this.tendencia(actual),
      oeePorLinea: await this.oeePorLinea(actual),
      comparativaTurno: this.comparativaTurno(actual, anterior),
    };
  }

  /**
   * Ventana con la que se calculan los deltas: la inmediatamente anterior de
   * la misma longitud o, con `comparar=anio_anterior`, el mismo rango un año
   * antes (antes se usaba siempre la anterior aunque la etiqueta dijera «año»).
   */
  private ventanaComparacion(ventana: Ventana, comparar?: string): { desde: string; hasta: string } {
    if (comparar === 'anio_anterior') {
      return { desde: restarAnio(ventana.desde), hasta: restarAnio(ventana.hasta) };
    }
    return { desde: sumarDias(ventana.desde, -ventana.dias), hasta: sumarDias(ventana.desde, -1) };
  }

  /** Sólo se publican las líneas que tuvieron órdenes dentro de la ventana. */
  private async oeePorLinea(agregado: AgregadoVentana): Promise<OeePorLinea[]> {
    const catalogo = await this.catalogoLineas.find();
    const porId = new Map(catalogo.map((l) => [l.id, l]));
    return [...agregado.porLinea.entries()]
      .filter(([, a]) => a.ordenes > 0)
      .map(([lineaId, a]) => {
        const detalle = oeeDe(a);
        const linea = porId.get(lineaId);
        return {
          lineaId,
          lineaCodigo: linea?.codigo ?? lineaId,
          lineaNombre: linea?.nombre ?? lineaId,
          oee: detalle.oee,
          disponibilidad: detalle.disponibilidad,
          desempeno: detalle.desempeno,
          calidad: detalle.calidad,
        };
      })
      .sort((a, b) => a.lineaCodigo.localeCompare(b.lineaCodigo));
  }

  private comparativaTurno(actual: AgregadoVentana, anterior: AgregadoVentana): ComparativaTurno[] {
    return TURNOS.filter((turno) => (actual.porTurno.get(turno)?.ordenes ?? 0) > 0).map((turno) => {
      const detalle = oeeDe(actual.porTurno.get(turno) ?? nuevoAcumulado());
      const previo = anterior.porTurno.get(turno);
      return {
        turno,
        turnoLabel: TURNO_LABEL[turno],
        oee: detalle.oee,
        disponibilidad: detalle.disponibilidad,
        desempeno: detalle.desempeno,
        calidad: detalle.calidad,
        deltaOee: previo && previo.ordenes > 0 ? redondear(detalle.oee - oeeDe(previo).oee) : 0,
      };
    });
  }

  /** Los cuatro KPI de la cabecera, con su delta frente a la ventana anterior. */
  private kpisDeVentana(
    actual: AgregadoVentana,
    anterior: AgregadoVentana,
    comparar: string,
  ): KpiValor[] {
    const detalle = oeeDe(actual.total);
    const sinDatos = actual.total.ordenes === 0;
    const previo = !sinDatos && anterior.total.ordenes > 0 ? oeeDe(anterior.total) : null;
    const referencia = comparar === 'anio_anterior' ? 'vs año anterior' : 'vs periodo anterior';
    const kpi = (id: string, label: string, valor: number, previoValor?: number, meta?: number): KpiValor => ({
      id,
      label,
      valor,
      unidad: '%',
      meta,
      ...(sinDatos ? { sinDatos: true } : {}),
      delta:
        previoValor === undefined
          ? undefined
          : { valor: redondear(valor - previoValor), unidad: 'pp', favorableSiSube: true, referencia },
    });
    return [
      kpi('oee', 'OEE', detalle.oee, previo?.oee, 85),
      kpi('disponibilidad', 'Disponibilidad', detalle.disponibilidad, previo?.disponibilidad),
      kpi('desempeno', 'Desempeño', detalle.desempeno, previo?.desempeno),
      kpi('calidad', 'Calidad', detalle.calidad, previo?.calidad),
    ];
  }

  /** Un punto por día operativo con órdenes dentro de la ventana. */
  private tendencia(agregado: AgregadoVentana): TendenciaOeePunto[] {
    return [...agregado.porFecha.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, acumulado]) => ({
        fecha,
        etiqueta: etiquetaFecha(fecha),
        oee: oeeDe(acumulado).oee,
        meta: META_OEE,
      }));
  }

  /* ---------------------------------------------------------------- */
  /* Hechos base de Paradas y Mermas (C1)                              */
  /* ---------------------------------------------------------------- */

  /**
   * Antes Paradas y Mermas se leían de tablas pre-agregadas (`parada_agregada`,
   * `merma_*`, `indicador_kpi`): una foto sin periodo, así que el informe —y las
   * tarjetas «Paradas no programadas» y «Merma del día» del Inicio— mostraba el
   * histórico entero fuera cual fuera el periodo, la línea o el turno elegidos.
   * Ahora se calcula sobre `parada`/`merma` filtrando por el día operativo de su
   * orden (`orden.fecha`), la línea y el turno de la orden.
   */
  private async contexto(query: ReporteQueryDto) {
    const ventana = await this.resolverVentana(query);
    const filtro: FiltroHechos = {
      desde: ventana.desde,
      hasta: ventana.hasta,
      lineaIds: toList(query.lineaId),
      turnos: toList(query.turno) as Turno[],
    };
    const [ordenes, lineas] = await Promise.all([this.ordenes.find(), this.catalogoLineas.find()]);
    const ordenPorId = new Map(ordenes.map((o) => [o.id, o]));
    const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
    const codigoLinea = (id: string) => lineaPorId.get(id)?.codigo ?? id;
    const comparacion = { ...filtro, ...this.ventanaComparacion(ventana, query.comparar) };
    return { ventana, filtro, comparacion, ordenes, ordenPorId, lineaPorId, codigoLinea };
  }

  /** `true` si el hecho (por su orden) cae en la ventana y en los filtros. */
  private static dentro(
    orden: OrdenFabricacion | undefined,
    lineaId: string,
    filtro: FiltroHechos,
  ): orden is OrdenFabricacion {
    if (!orden) return false;
    if (orden.fecha < filtro.desde || orden.fecha > filtro.hasta) return false;
    if (filtro.lineaIds.length > 0 && !filtro.lineaIds.includes(lineaId)) return false;
    if (filtro.turnos.length > 0 && !filtro.turnos.includes(orden.turno)) return false;
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* 06.B — Paradas                                                    */
  /* ---------------------------------------------------------------- */

  async paradasResumen(query: ReporteQueryDto): Promise<ParadasResumen> {
    const ctx = await this.contexto(query);
    const [todas, causas] = await Promise.all([this.paradasCrudas.find(), this.causasParada.find()]);
    const causaPorId = new Map(causas.map((c) => [c.id, c]));
    /* La clasificación sale del tipo raíz (`tipoCausaId`); si falta, de la causa. */
    const clasificacionDe = (p: Parada) =>
      (causaPorId.get(p.tipoCausaId) ?? causaPorId.get(p.causaId))?.clasificacion ?? 'imprevista';
    const filtrar = (filtro: FiltroHechos) =>
      todas.filter(
        (p) =>
          ReportsService.dentro(ctx.ordenPorId.get(p.ordenId), p.lineaId, filtro) &&
          (!query.clasificacion || clasificacionDe(p) === query.clasificacion),
      );
    const actuales = filtrar(ctx.filtro);
    const previas = filtrar(ctx.comparacion);

    interface Acum {
      causa: CausaParada | undefined;
      causaId: string;
      cantidad: number;
      minutos: number;
      porLinea: Map<string, number>;
      porFecha: Map<string, number>;
    }
    const porCausa = new Map<string, Acum>();
    const porCategoria: Record<CategoriaParada, number> = { rutinarias: 0, imprevistas: 0, fallas: 0 };
    for (const p of actuales) {
      const orden = ctx.ordenPorId.get(p.ordenId)!;
      let a = porCausa.get(p.causaId);
      if (!a) {
        a = {
          causa: causaPorId.get(p.causaId),
          causaId: p.causaId,
          cantidad: 0,
          minutos: 0,
          porLinea: new Map(),
          porFecha: new Map(),
        };
        porCausa.set(p.causaId, a);
      }
      a.cantidad += 1;
      a.minutos += p.duracionMin;
      a.porLinea.set(p.lineaId, (a.porLinea.get(p.lineaId) ?? 0) + p.duracionMin);
      a.porFecha.set(orden.fecha, (a.porFecha.get(orden.fecha) ?? 0) + p.duracionMin);
      porCategoria[categoriaDeTipo(causaPorId.get(p.tipoCausaId))] += p.duracionMin;
    }

    const filas = [...porCausa.values()].sort((a, b) => b.minutos - a.minutos);
    const totalMinutos = filas.reduce((t, f) => t + f.minutos, 0);
    /* Sparkline: los últimos 7 días de la ventana. */
    const ultimos7 = Array.from({ length: Math.min(7, ctx.ventana.dias) }, (_, i) =>
      sumarDias(ctx.ventana.hasta, i - Math.min(7, ctx.ventana.dias) + 1),
    );

    let acumulado = 0;
    const pareto: ParetoParada[] = filas.map((f) => {
      acumulado += f.minutos;
      return {
        causaCodigo: f.causa?.codigo ?? f.causaId,
        causaNombre: f.causa?.nombre ?? 'Causa desconocida',
        minutos: f.minutos,
        acumuladoPct: totalMinutos > 0 ? redondear((acumulado / totalMinutos) * 100) : 0,
      };
    });

    const donut: DonutSegmento[] = (Object.keys(porCategoria) as CategoriaParada[]).map((clave) => ({
      clave,
      label: ETIQUETA_CATEGORIA[clave],
      valor: porCategoria[clave],
      pct: totalMinutos > 0 ? redondear((porCategoria[clave] / totalMinutos) * 100) : 0,
    }));

    const detallePorCausa: DetalleCausaParada[] = filas.map((f) => ({
      causaId: f.causaId,
      causaCodigo: f.causa?.codigo ?? f.causaId,
      causaNombre: f.causa?.nombre ?? 'Causa desconocida',
      cantidad: f.cantidad,
      minutos: f.minutos,
      pct: totalMinutos > 0 ? redondear((f.minutos / totalMinutos) * 100) : 0,
      lineaMasAfectada: lineaTop(f.porLinea, (id) => {
        const l = ctx.lineaPorId.get(id);
        return l ? `${l.codigo} ${l.nombre}` : id;
      }),
      tendencia: ultimos7.map((d) => f.porFecha.get(d) ?? 0),
    }));

    /* % tiempo = minutos de parada / tiempo planificado de las mismas órdenes. */
    const agregado = agregarVentana(ctx.ordenes, [], {
      desde: ctx.filtro.desde,
      hasta: ctx.filtro.hasta,
      lineaIds: ctx.filtro.lineaIds,
      turnos: ctx.filtro.turnos,
    });
    const planificado = agregado.total.tiempoPlanificadoMin;
    const minutosPrevios = previas.reduce((t, p) => t + p.duracionMin, 0);
    const hayPrevio = this.hayOrdenes(ctx.ordenes, ctx.comparacion);
    const sinDatos = actuales.length === 0 && agregado.total.ordenes === 0;
    const referencia = query.comparar === 'anio_anterior' ? 'vs año anterior' : 'vs periodo anterior';
    const kpi = (
      id: string,
      label: string,
      valor: number,
      unidad: string,
      previo?: number,
    ): KpiValor => ({
      id,
      label,
      valor,
      unidad,
      ...(sinDatos ? { sinDatos: true } : {}),
      delta:
        previo === undefined || !hayPrevio || sinDatos
          ? undefined
          : { valor: redondear(valor - previo), unidad, favorableSiSube: false, referencia },
    });

    return {
      periodo: ctx.ventana.periodo,
      desde: ctx.ventana.desde,
      hasta: ctx.ventana.hasta,
      kpis: [
        kpi('paradas', 'Paradas', actuales.length, '', previas.length),
        kpi('minutos', 'Minutos', totalMinutos, 'min', minutosPrevios),
        kpi('mttr', 'MTTR', actuales.length ? redondear(totalMinutos / actuales.length) : 0, 'min'),
        kpi('pct_tiempo', '% tiempo', planificado > 0 ? redondear((totalMinutos / planificado) * 100) : 0, '%'),
      ],
      pareto,
      donut,
      detallePorCausa,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 06.C — Mermas                                                     */
  /* ---------------------------------------------------------------- */

  async mermasResumen(query: ReporteQueryDto): Promise<MermasResumen> {
    const ctx = await this.contexto(query);
    const [todas, causas, productos] = await Promise.all([
      this.mermasCrudas.find(),
      this.causasMerma.find(),
      this.productos.find(),
    ]);
    const causaPorId = new Map(causas.map((c) => [c.id, c]));
    const pesoPorProducto = new Map(productos.map((p) => [p.id, p.pesoKg ?? 0]));
    const filtrar = (filtro: FiltroHechos) =>
      todas.filter((m) => ReportsService.dentro(ctx.ordenPorId.get(m.ordenId), m.lineaId, filtro));
    const actuales = filtrar(ctx.filtro);
    const previas = filtrar(ctx.comparacion);

    const porLinea = new Map<string, Record<TipoMermaCodigo, number>>();
    interface Acum {
      causaId: string;
      causa: CausaMerma | undefined;
      kg: number;
      porTipo: Record<TipoMermaCodigo, number>;
      porLinea: Map<string, number>;
      porTurno: Map<Turno, number>;
    }
    const porCausa = new Map<string, Acum>();
    let baldes = 0;
    for (const m of actuales) {
      const orden = ctx.ordenPorId.get(m.ordenId)!;
      if (m.enviarPasteurizacion) baldes += 1;
      const tipos = porLinea.get(m.lineaId) ?? { MP: 0, EP: 0, PT: 0 };
      tipos[m.tipo] += m.cantidadKg;
      porLinea.set(m.lineaId, tipos);
      let a = porCausa.get(m.causaId);
      if (!a) {
        a = {
          causaId: m.causaId,
          causa: causaPorId.get(m.causaId),
          kg: 0,
          porTipo: { MP: 0, EP: 0, PT: 0 },
          porLinea: new Map(),
          porTurno: new Map(),
        };
        porCausa.set(m.causaId, a);
      }
      a.kg += m.cantidadKg;
      a.porTipo[m.tipo] += m.cantidadKg;
      a.porLinea.set(m.lineaId, (a.porLinea.get(m.lineaId) ?? 0) + m.cantidadKg);
      a.porTurno.set(orden.turno, (a.porTurno.get(orden.turno) ?? 0) + m.cantidadKg);
    }

    const apiladasPorLinea: MermaApiladaLinea[] = [...porLinea.entries()]
      .map(([lineaId, kg]) => {
        const linea = ctx.lineaPorId.get(lineaId);
        return {
          lineaId,
          lineaCodigo: linea?.codigo ?? lineaId,
          lineaNombre: linea?.nombre ?? lineaId,
          MP: redondear(kg.MP, 2),
          EP: redondear(kg.EP, 2),
          PT: redondear(kg.PT, 2),
          total: redondear(kg.MP + kg.EP + kg.PT, 2),
        };
      })
      .sort((a, b) => a.lineaCodigo.localeCompare(b.lineaCodigo));

    const filas = [...porCausa.values()].sort((a, b) => b.kg - a.kg);
    const totalKg = filas.reduce((t, f) => t + f.kg, 0);
    const heatmap: HeatmapCelda[] = filas.flatMap((f) =>
      TURNOS.map((turno) => ({
        fila: f.causa?.codigo ?? f.causaId,
        filaLabel: `${f.causa?.codigo ?? f.causaId} ${f.causa?.nombre ?? ''}`.trim(),
        columna: turno,
        columnaLabel: TURNO_LABEL[turno],
        valor: redondear(f.porTurno.get(turno) ?? 0, 2),
      })),
    );
    const tabla: DetalleCausaMerma[] = filas.map((f) => ({
      causaId: f.causaId,
      causaCodigo: f.causa?.codigo ?? f.causaId,
      causaNombre: f.causa?.nombre ?? 'Causa desconocida',
      kg: redondear(f.kg, 2),
      pct: totalKg > 0 ? redondear((f.kg / totalKg) * 100) : 0,
      tipoPredominante: (Object.entries(f.porTipo) as [TipoMermaCodigo, number][]).sort(
        (x, y) => y[1] - x[1],
      )[0]![0],
      lineaMasAfectada: lineaTop(f.porLinea, ctx.codigoLinea),
    }));

    /* % sobre producción = kg de merma / kg producidos por las mismas órdenes. */
    const kgProducidos = ctx.ordenes
      .filter((o) => ReportsService.dentro(o, o.lineaId, ctx.filtro))
      .reduce((t, o) => t + o.producido * (pesoPorProducto.get(o.productoId) ?? 0), 0);
    const kgPrevios = previas.reduce((t, m) => t + m.cantidadKg, 0);
    const hayPrevio = this.hayOrdenes(ctx.ordenes, ctx.comparacion);
    const sinDatos =
      actuales.length === 0 && !this.hayOrdenes(ctx.ordenes, ctx.filtro);
    const referencia = query.comparar === 'anio_anterior' ? 'vs año anterior' : 'vs periodo anterior';
    const kpi = (id: string, label: string, valor: number, unidad: string, previo?: number): KpiValor => ({
      id,
      label,
      valor,
      unidad,
      ...(sinDatos ? { sinDatos: true } : {}),
      delta:
        previo === undefined || !hayPrevio || sinDatos
          ? undefined
          : { valor: redondear(valor - previo), unidad, favorableSiSube: false, referencia },
    });

    return {
      periodo: ctx.ventana.periodo,
      desde: ctx.ventana.desde,
      hasta: ctx.ventana.hasta,
      kpis: [
        kpi('merma_total', 'Merma total', redondear(totalKg), 'kg', redondear(kgPrevios)),
        kpi(
          'merma_pct',
          '% sobre producción',
          kgProducidos > 0 ? redondear((totalKg / kgProducidos) * 100) : 0,
          '%',
        ),
        kpi('merma_costo', 'Costo estimado', Math.round(totalKg * COSTO_MERMA_SOL_KG), 'S/'),
        kpi('baldes', 'Baldes a pasteurizar', baldes, ''),
      ],
      apiladasPorLinea,
      heatmap,
      tabla,
    };
  }

  /** ¿Hay órdenes en la ventana y filtros? Distingue «0 paradas» de «sin datos». */
  private hayOrdenes(ordenes: OrdenFabricacion[], filtro: FiltroHechos): boolean {
    return ordenes.some((o) => ReportsService.dentro(o, o.lineaId, filtro));
  }

  /**
   * Último día con indicadores diarios, o el día real si hay datos de hoy.
   * Es el mismo criterio de «día operativo» que usan Órdenes y Tiempo real: los
   * agregados están anclados a la fecha congelada del seed (`HOY`), así que
   * fechar la ventana con el reloj del servidor devolvía rangos vacíos y
   * fechas distintas a las del modo mock.
   */
  private async anclaVentana(): Promise<string> {
    const filas = await this.diarios.find({ order: { fecha: 'ASC' } });
    return diaOperativo(filas.map((f) => ({ fecha: f.fecha, estado: 'agregado' })));
  }

  /** Turno desconocido o línea inexistente → 422 (antes, 200 con `sinDatos`). */
  private async validarFiltros(query: ReporteQueryDto): Promise<void> {
    const errores: Record<string, string> = {};
    const turnos = toList(query.turno);
    if (turnos.some((t) => !(TURNOS as readonly string[]).includes(t))) {
      errores.turno = `turno no reconocido; usa ${TURNOS.join(', ')}`;
    }
    const lineaIds = [...new Set(toList(query.lineaId))];
    if (lineaIds.length) {
      const existentes = await this.catalogoLineas.count({ where: { id: In(lineaIds) } });
      if (existentes !== lineaIds.length) errores.lineaId = 'La línea seleccionada no existe';
    }
    if (Object.keys(errores).length) throw new ValidationException(errores);
  }

  /**
   * Ventana del informe. Con `periodo=personalizado` exige `desde` y `hasta`
   * reales y en orden (422 si no: antes `2026-02-30` daba 500 y un rango
   * invertido devolvía ceros como si fueran datos, M7).
   */
  private async resolverVentana(query: ReporteQueryDto): Promise<Ventana> {
    await this.validarFiltros(query);
    const periodo = PERIODO_CANONICO[query.periodo] ?? 'semana';
    const esCustom = periodo === 'personalizado';
    if (esCustom && (query.desde || query.hasta)) {
      if (!query.desde || !query.hasta) {
        throw new ValidationException({
          [query.desde ? 'hasta' : 'desde']: 'Indica las dos fechas del rango personalizado',
        });
      }
      const errores = erroresDeRango(query.desde, query.hasta);
      if (Object.keys(errores).length) throw new ValidationException(errores);
      const dias =
        Math.round(
          (Date.parse(`${query.hasta}T00:00:00Z`) - Date.parse(`${query.desde}T00:00:00Z`)) / 86_400_000,
        ) + 1;
      return { periodo, desde: query.desde, hasta: query.hasta, dias };
    }
    const dias = DIAS_POR_PERIODO[query.periodo] ?? 7;
    const hasta = await this.anclaVentana();
    return { periodo, desde: sumarDiasLocal(hasta, -(dias - 1)), hasta, dias };
  }

  /** Utilizado por Analítica para el heatmap causa × turno. */
  async paradasPorCausaYTurno(): Promise<ParadaAgregada[]> {
    return this.paradas.find({ order: { orden: 'ASC' } });
  }

  /** Utilizado por las exportaciones para nombrar las líneas filtradas. */
}
