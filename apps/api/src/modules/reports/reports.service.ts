import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  ComparativaTurno,
  Delta,
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
  Turno,
} from '@mes/types';
import { TURNO_LABEL, TURNOS } from '@mes/types';
import {
  IndicadorDiario,
  IndicadorKpi,
  Linea,
  MermaAgregada,
  MermaCausa,
  OrdenFabricacion,
  Parada,
  ParadaAgregada,
  ParadaCategoria,
} from '../../database/entities';
import { META_OEE } from '@mes/shared';
import { diaOperativo } from '../../common/utils';
import { agregarVentana, nuevoAcumulado, oeeDe, type AgregadoVentana } from './reports-oee';
import { etiquetaFecha, redondear, toList } from './reports.util';
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

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(IndicadorKpi) private readonly kpis: Repository<IndicadorKpi>,
    @InjectRepository(IndicadorDiario) private readonly diarios: Repository<IndicadorDiario>,
    @InjectRepository(ParadaAgregada) private readonly paradas: Repository<ParadaAgregada>,
    @InjectRepository(ParadaCategoria) private readonly categorias: Repository<ParadaCategoria>,
    @InjectRepository(MermaAgregada) private readonly mermasLinea: Repository<MermaAgregada>,
    @InjectRepository(MermaCausa) private readonly mermasCausa: Repository<MermaCausa>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradasCrudas: Repository<Parada>,
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
    const previa = this.ventanaPrevia(ventana);
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

  /** Ventana inmediatamente anterior, de la misma longitud, para los deltas. */
  private ventanaPrevia(ventana: Ventana): { desde: string; hasta: string } {
    const dia = (iso: string, delta: number): string => {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + delta);
      return d.toISOString().slice(0, 10);
    };
    return { desde: dia(ventana.desde, -ventana.dias), hasta: dia(ventana.desde, -1) };
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
    const previo = anterior.total.ordenes > 0 ? oeeDe(anterior.total) : null;
    const referencia = comparar === 'anio_anterior' ? 'vs año anterior' : 'vs periodo anterior';
    const kpi = (id: string, label: string, valor: number, previoValor?: number, meta?: number): KpiValor => ({
      id,
      label,
      valor,
      unidad: '%',
      meta,
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
  /* 06.B — Paradas                                                    */
  /* ---------------------------------------------------------------- */

  async paradasResumen(query: ReporteQueryDto): Promise<ParadasResumen> {
    const ventana = await this.resolverVentana(query);
    const filas = await this.paradas.find({ order: { minutos: 'DESC' } });
    const totalMinutos = filas.reduce((a, f) => a + f.minutos, 0);

    let acumulado = 0;
    const pareto: ParetoParada[] = filas.map((f) => {
      acumulado += f.minutos;
      return {
        causaCodigo: f.causaCodigo,
        causaNombre: f.causaNombre,
        minutos: f.minutos,
        acumuladoPct: totalMinutos > 0 ? redondear((acumulado / totalMinutos) * 100) : 0,
      };
    });

    const categorias = await this.categorias.find({ order: { orden: 'ASC' } });
    const totalDonut = categorias.reduce((a, c) => a + c.minutos, 0);
    const donut: DonutSegmento[] = categorias.map((c) => ({
      clave: c.clave,
      label: c.label,
      valor: c.minutos,
      pct: totalDonut > 0 ? redondear((c.minutos / totalDonut) * 100) : 0,
    }));

    const detallePorCausa: DetalleCausaParada[] = filas.map((f) => ({
      causaId: f.causaId,
      causaCodigo: f.causaCodigo,
      causaNombre: f.causaNombre,
      cantidad: f.cantidad,
      minutos: f.minutos,
      pct: totalMinutos > 0 ? redondear((f.minutos / totalMinutos) * 100) : 0,
      lineaMasAfectada: f.lineaMasAfectada,
      tendencia: f.tendencia,
    }));

    return {
      periodo: ventana.periodo,
      desde: ventana.desde,
      hasta: ventana.hasta,
      kpis: await this.kpisDe('paradas', query.comparar),
      pareto,
      donut,
      detallePorCausa,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 06.C — Mermas                                                     */
  /* ---------------------------------------------------------------- */

  async mermasResumen(query: ReporteQueryDto): Promise<MermasResumen> {
    const ventana = await this.resolverVentana(query);
    const lineaIds = toList(query.lineaId);

    const filasLinea = await this.mermasLinea.find({ order: { orden: 'ASC' } });
    const seleccionadas = lineaIds.length
      ? filasLinea.filter((l) => lineaIds.includes(l.lineaId))
      : filasLinea;
    const apiladasPorLinea: MermaApiladaLinea[] = seleccionadas.map((l) => ({
      lineaId: l.lineaId,
      lineaCodigo: l.lineaCodigo,
      lineaNombre: l.lineaNombre,
      MP: l.mp,
      EP: l.ep,
      PT: l.pt,
      total: redondear(l.mp + l.ep + l.pt),
    }));

    const filasCausa = await this.mermasCausa.find({ order: { orden: 'ASC' } });
    const heatmap: HeatmapCelda[] = filasCausa.flatMap((c) =>
      TURNOS.map((turno, i) => ({
        fila: c.causaCodigo,
        filaLabel: `${c.causaCodigo} ${c.causaNombre}`,
        columna: turno,
        columnaLabel: TURNO_LABEL[turno],
        valor: c.kgPorTurno[i] ?? 0,
      })),
    );

    const totalKg = filasCausa.reduce((a, c) => a + c.kgPorTurno.reduce((x, y) => x + y, 0), 0);
    const tabla: DetalleCausaMerma[] = filasCausa.map((c) => {
      const kg = c.kgPorTurno.reduce((a, b) => a + b, 0);
      return {
        causaId: c.causaId,
        causaCodigo: c.causaCodigo,
        causaNombre: c.causaNombre,
        kg,
        pct: totalKg > 0 ? redondear((kg / totalKg) * 100) : 0,
        tipoPredominante: c.tipoPredominante,
        lineaMasAfectada: c.lineaMasAfectada,
      };
    });

    return {
      periodo: ventana.periodo,
      desde: ventana.desde,
      hasta: ventana.hasta,
      kpis: await this.kpisDe('mermas', query.comparar),
      apiladasPorLinea,
      heatmap,
      tabla,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  private async kpisDe(ambito: IndicadorKpi['ambito'], comparar: string): Promise<KpiValor[]> {
    const filas = await this.kpis.find({ where: { ambito }, order: { orden: 'ASC' } });
    const anio = comparar === 'anio_anterior';
    return filas.map((f) => {
      const valorDelta = anio ? f.deltaAnioValor : f.deltaValor;
      const delta: Delta | undefined =
        valorDelta === null || valorDelta === undefined
          ? undefined
          : {
              valor: valorDelta,
              unidad: f.deltaUnidad ?? f.unidad,
              favorableSiSube: f.deltaFavorableSiSube,
              referencia: anio ? 'vs año anterior' : 'vs periodo anterior',
            };
      return {
        id: f.clave,
        label: f.label,
        valor: f.valor,
        unidad: f.unidad,
        meta: f.meta ?? undefined,
        delta,
      };
    });
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

  private async resolverVentana(query: ReporteQueryDto): Promise<Ventana> {
    const periodo = PERIODO_CANONICO[query.periodo] ?? 'semana';
    const esCustom = periodo === 'personalizado';
    if (esCustom && query.desde && query.hasta) {
      const dias = Math.max(
        1,
        Math.round((new Date(query.hasta).getTime() - new Date(query.desde).getTime()) / 86400000) + 1,
      );
      return { periodo, desde: query.desde, hasta: query.hasta, dias };
    }
    const dias = DIAS_POR_PERIODO[query.periodo] ?? 7;
    const hasta = new Date(`${await this.anclaVentana()}T00:00:00`);
    const desde = new Date(hasta);
    desde.setDate(desde.getDate() - (dias - 1));
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { periodo, desde: fmt(desde), hasta: fmt(hasta), dias };
  }

  /** Utilizado por Analítica para el heatmap causa × turno. */
  async paradasPorCausaYTurno(): Promise<ParadaAgregada[]> {
    return this.paradas.find({ order: { orden: 'ASC' } });
  }

  /** Utilizado por las exportaciones para nombrar las líneas filtradas. */
}
