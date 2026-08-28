import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { computeOee } from '@mes/shared';
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
import { TURNO_LABEL } from '@mes/types';
import {
  IndicadorDiario,
  IndicadorKpi,
  IndicadorLinea,
  IndicadorTurno,
  MermaAgregada,
  MermaCausa,
  ParadaAgregada,
  ParadaCategoria,
} from '../../database/entities';
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
    @InjectRepository(IndicadorLinea) private readonly lineas: Repository<IndicadorLinea>,
    @InjectRepository(IndicadorTurno) private readonly turnos: Repository<IndicadorTurno>,
    @InjectRepository(ParadaAgregada) private readonly paradas: Repository<ParadaAgregada>,
    @InjectRepository(ParadaCategoria) private readonly categorias: Repository<ParadaCategoria>,
    @InjectRepository(MermaAgregada) private readonly mermasLinea: Repository<MermaAgregada>,
    @InjectRepository(MermaCausa) private readonly mermasCausa: Repository<MermaCausa>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 06.A — Indicadores                                                */
  /* ---------------------------------------------------------------- */

  async indicadores(query: ReporteQueryDto): Promise<IndicadoresResumen> {
    const ventana = this.resolverVentana(query);
    const lineaIds = toList(query.lineaId);
    const turnosFiltro = toList(query.turno) as Turno[];

    const filasLinea = await this.lineas.find({ order: { orden: 'ASC' } });
    const seleccionadas = lineaIds.length
      ? filasLinea.filter((l) => lineaIds.includes(l.lineaId))
      : filasLinea;

    const oeePorLinea: OeePorLinea[] = seleccionadas.map((l) => {
      const detalle = computeOee({
        tiempoPlanificadoMin: l.tiempoPlanificadoMin,
        paradasMin: l.paradasMin,
        unidadesProducidas: l.unidadesProducidas,
        unidadesBuenas: l.unidadesBuenas,
        velocidadEstandar: l.velocidadEstandar,
      });
      return {
        lineaId: l.lineaId,
        lineaCodigo: l.lineaCodigo,
        lineaNombre: l.lineaNombre,
        oee: detalle.oee,
        disponibilidad: detalle.disponibilidad,
        desempeno: detalle.desempeno,
        calidad: detalle.calidad,
      };
    });

    const filasTurno = await this.turnos.find({ order: { orden: 'ASC' } });
    const comparativaTurno: ComparativaTurno[] = filasTurno
      .filter((t) => turnosFiltro.length === 0 || turnosFiltro.includes(t.turno))
      .map((t) => ({
        turno: t.turno,
        turnoLabel: t.turnoLabel ?? TURNO_LABEL[t.turno],
        oee: t.oee,
        disponibilidad: t.disponibilidad,
        desempeno: t.desempeno,
        calidad: t.calidad,
        deltaOee: t.deltaOee,
      }));

    const kpis = lineaIds.length
      ? this.kpisDesdeLineas(seleccionadas, query.comparar)
      : await this.kpisDe('indicadores', query.comparar);

    return {
      periodo: ventana.periodo,
      desde: ventana.desde,
      hasta: ventana.hasta,
      kpis,
      tendenciaOee: await this.tendencia(ventana),
      oeePorLinea,
      comparativaTurno,
    };
  }

  /** Cuando hay filtro de línea, los KPI se recalculan con `computeOee`. */
  private kpisDesdeLineas(filas: IndicadorLinea[], comparar: string): KpiValor[] {
    const total = filas.reduce(
      (acc, l) => ({
        plan: acc.plan + l.tiempoPlanificadoMin,
        paradas: acc.paradas + l.paradasMin,
        producidas: acc.producidas + l.unidadesProducidas,
        buenas: acc.buenas + l.unidadesBuenas,
        teorico: acc.teorico + (l.tiempoPlanificadoMin - l.paradasMin) * l.velocidadEstandar,
      }),
      { plan: 0, paradas: 0, producidas: 0, buenas: 0, teorico: 0 },
    );
    const disponibilidad = total.plan > 0 ? redondear(((total.plan - total.paradas) / total.plan) * 100) : 0;
    const desempeno = total.teorico > 0 ? redondear((total.producidas / total.teorico) * 100) : 0;
    const calidad = total.producidas > 0 ? redondear((total.buenas / total.producidas) * 100) : 0;
    const oee = redondear((disponibilidad / 100) * (desempeno / 100) * (calidad / 100) * 100);
    const referencia = comparar === 'anio_anterior' ? 'vs año anterior' : 'vs periodo anterior';
    const kpi = (id: string, label: string, valor: number, meta?: number): KpiValor => ({
      id,
      label,
      valor,
      unidad: '%',
      meta,
      delta: { valor: 0, unidad: 'pp', favorableSiSube: true, referencia },
    });
    return [
      kpi('oee', 'OEE', oee, 85),
      kpi('disponibilidad', 'Disponibilidad', disponibilidad),
      kpi('desempeno', 'Desempeño', desempeno),
      kpi('calidad', 'Calidad', calidad),
    ];
  }

  private async tendencia(ventana: Ventana): Promise<TendenciaOeePunto[]> {
    const filas = await this.diarios.find({ order: { fecha: 'ASC' } });
    const dentro = filas.filter((f) => f.fecha >= ventana.desde && f.fecha <= ventana.hasta);
    const serie = dentro.length ? dentro : filas.slice(-ventana.dias);
    return serie.map((f) => ({
      fecha: f.fecha,
      etiqueta: etiquetaFecha(f.fecha),
      oee: f.oee,
      meta: f.meta,
    }));
  }

  /* ---------------------------------------------------------------- */
  /* 06.B — Paradas                                                    */
  /* ---------------------------------------------------------------- */

  async paradasResumen(query: ReporteQueryDto): Promise<ParadasResumen> {
    const ventana = this.resolverVentana(query);
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
    const ventana = this.resolverVentana(query);
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
      (['M', 'T', 'N'] as Turno[]).map((turno, i) => ({
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

  private resolverVentana(query: ReporteQueryDto): Ventana {
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
    const hasta = new Date();
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
  async nombresLinea(ids: string[]): Promise<IndicadorLinea[]> {
    if (!ids.length) return this.lineas.find({ order: { orden: 'ASC' } });
    return this.lineas.find({ where: { lineaId: In(ids) }, order: { orden: 'ASC' } });
  }
}
