'use client';

import * as React from 'react';
import type { BadgeColor, LineSegment } from '@mes/ui';
import type { LineaEstado, Periodo } from '@mes/types';
import { TIPO_MERMA_LABEL } from '@mes/types';
import {
  formatDelta,
  formatDurationMin,
  formatKg,
  formatMinutes,
  formatNumber,
  formatPct,
  formatSpeed,
  formatTime,
} from '@mes/shared';
import { rangoPeriodo } from '@mes/shared';
import { useAlertasRecientes } from '@/features/alerts/hooks';
import { useEvidenciaResumen } from '@/features/evidence/hooks';
import { useParadas } from '@/features/downtimes/hooks';
import { useIndicadores, useReporteMermas, useReporteParadas } from '@/features/reports/hooks';
import { useTiempoReal } from '@/features/realtime/hooks';
import { useMermas } from '@/features/scrap/hooks';
import { useVelocidades } from '@/features/speeds/hooks';
import { buscarKpi, toKpiVista, type KpiVista } from './kpis';

/** No existe `/resumen-del-dia`: el Home compone el suyo desde los reportes del día. */
const PERIODO_HOY: Periodo = 'hoy';
/** El ranking de causas del frame es semanal (`Top causas de parada (semana)`). */
const PERIODO_SEMANA: Periodo = 'semana';

/** `hoy` compara contra el día anterior; el API lo expresa como "periodo anterior". */
const REFERENCIA: Record<string, string> = { hoy: 'vs ayer', semana: 'vs semana anterior' };

/** Etiquetas del frame 2163:17435 (el API devuelve el nombre corto del indicador). */
const LABEL_OEE: Record<string, string> = {
  oee: 'OEE del día',
  disponibilidad: 'Disponibilidad',
  desempeno: 'Desempeño',
  calidad: 'Calidad',
};

export function useResumenJefe() {
  const tiempoReal = useTiempoReal();
  const indicadores = useIndicadores({ periodo: PERIODO_HOY });
  const paradasHoy = useReporteParadas({ periodo: PERIODO_HOY });
  const paradasSemana = useReporteParadas({ periodo: PERIODO_SEMANA });
  const mermas = useReporteMermas({ periodo: PERIODO_HOY });
  const evidencia = useEvidenciaResumen();
  const alertas = useAlertasRecientes(3);

  const consultas = [tiempoReal, indicadores, paradasHoy, paradasSemana, mermas, evidencia, alertas];

  /* Fila 1 — OEE y sus tres componentes, en el orden del frame. */
  const kpisOee = React.useMemo<KpiVista[]>(() => {
    const kpis = indicadores.data?.kpis ?? [];
    return Object.keys(LABEL_OEE)
      .map((id) => buscarKpi(kpis, id))
      .filter((k): k is NonNullable<typeof k> => Boolean(k))
      .map((kpi) =>
        toKpiVista(kpi, {
          label: LABEL_OEE[kpi.id] ?? kpi.label,
          context: kpi.delta ? (REFERENCIA[PERIODO_HOY] ?? kpi.delta.referencia) : undefined,
        }),
      );
  }, [indicadores.data]);

  /* Fila 2 — merma, paradas no programadas y el KPI TRI de la tesis. */
  const kpisOperacion = React.useMemo<KpiVista[]>(() => {
    const filas: KpiVista[] = [];

    const merma = buscarKpi(mermas.data?.kpis, 'merma_pct');
    if (merma) {
      filas.push(
        toKpiVista(merma, {
          label: 'Merma del día',
          context: merma.delta ? (REFERENCIA[PERIODO_HOY] ?? merma.delta.referencia) : undefined,
        }),
      );
    }

    const paradas = buscarKpi(paradasHoy.data?.kpis, 'paradas');
    const minutos = buscarKpi(paradasHoy.data?.kpis, 'minutos');
    if (paradas) {
      filas.push({
        id: 'paradas_no_programadas',
        label: 'Paradas no programadas',
        value: formatPct(paradas.valor, 0).replace(/ %$/, ''),
        delta: minutos ? `${formatNumber(minutos.valor)} min` : undefined,
        trend: 'down',
        favorable: false,
        context: minutos ? 'detenido total' : undefined,
      });
    }

    /* TRI (Anexo 02): tiempo medio de registro y su reducción frente al pretest. */
    const tri = evidencia.data?.kpis.find((k) => k.id === 'TRI');
    const pretest = evidencia.data?.comparativaTri.find((c) => c.etapa === 'Pretest');
    if (tri) {
      const reduccion =
        pretest && pretest.minutos > 0 ? ((tri.valor - pretest.minutos) / pretest.minutos) * 100 : undefined;
      filas.push({
        id: 'tri',
        label: 'Tiempo medio de registro',
        value: formatMinutes(tri.valor),
        delta: reduccion === undefined ? undefined : formatDelta(reduccion, '%', 0),
        trend: reduccion === undefined || reduccion === 0 ? 'flat' : reduccion < 0 ? 'down' : 'up',
        favorable: reduccion !== undefined && reduccion < 0,
        context: pretest ? `vs pretest (${formatMinutes(pretest.minutos)})` : undefined,
      });
    }

    return filas;
  }, [mermas.data, paradasHoy.data, evidencia.data]);

  return {
    tiempoReal: tiempoReal.data,
    kpisOee,
    kpisOperacion,
    oeePorLinea: indicadores.data?.oeePorLinea ?? [],
    topCausas: paradasSemana.data?.pareto ?? [],
    alertas: alertas.data?.data ?? [],
    lineas: tiempoReal.data?.lineas ?? [],
    isPending: consultas.some((c) => c.isPending),
    isError: consultas.some((c) => c.isError),
    error: consultas.find((c) => c.error)?.error ?? null,
    refetch: () => consultas.forEach((c) => void c.refetch()),
  };
}

/* ------------------------------------------------------------------ */
/* Panel del maquinista (frame 2165:769)                               */
/* ------------------------------------------------------------------ */

export interface RegistroPropio {
  id: string;
  /** ISO-8601 del evento, para ordenar. */
  fechaIso: string;
  /** `09:12` */
  hora: string;
  tipo: 'Parada' | 'Merma' | 'Velocidad';
  detalle: string;
  estadoLabel: string;
  estadoColor: BadgeColor;
}

/** Minutos de un turno completo (D/N, 12 h cada uno), base del timeline de la Line card. */
const MINUTOS_TURNO = 720;
/** A partir de aquí el timeline se agrega: más tramos y la barra se vuelve ilegible. */
const MAX_TRAMOS = 6;

/**
 * Panel del maquinista: su línea en tiempo real, los tres KPI del turno, el
 * timeline de la Line card, la alerta abierta de su línea y sus últimos
 * registros (paradas + mermas + velocidades combinadas).
 */
export function useResumenMaquinista(lineaId: string | undefined, limiteRegistros = 3) {
  const habilitado = Boolean(lineaId);
  const tiempoReal = useTiempoReal();

  /* "del turno" = del día operativo que reporta tiempo real (no el reloj del
   * navegador): el rango acota paradas, mermas y velocidades. */
  const dia = React.useMemo(
    () => rangoPeriodo(PERIODO_HOY, tiempoReal.data?.diaOperativo),
    [tiempoReal.data?.diaOperativo],
  );
  const filtro = habilitado ? { lineaId, desde: dia.desde, hasta: dia.hasta } : {};

  const alertas = useAlertasRecientes(6);
  const paradas = useParadas(filtro);
  const mermas = useMermas(filtro);
  const velocidades = useVelocidades(filtro);

  const linea: LineaEstado | undefined = React.useMemo(
    () => tiempoReal.data?.lineas.find((l) => l.lineaId === lineaId),
    [tiempoReal.data, lineaId],
  );

  const alerta = React.useMemo(
    () => alertas.data?.data.find((a) => a.lineaId === lineaId),
    [alertas.data, lineaId],
  );

  const listaParadas = React.useMemo(
    () => (habilitado ? (paradas.data?.data ?? []) : []),
    [habilitado, paradas.data],
  );

  const minutosParados = React.useMemo(
    () => listaParadas.reduce((total, p) => total + p.duracionMin, 0),
    [listaParadas],
  );

  /**
   * Timeline de 8 px de la Line card. `ok` son los minutos equivalentes de
   * producción (producido ÷ velocidad estándar), `stop` los minutos detenidos y
   * `idle` lo que resta del turno. Con pocas paradas se alternan en orden
   * cronológico; a partir de `MAX_TRAMOS` se agregan para que siga legible.
   */
  const segmentos = React.useMemo<LineSegment[]>(() => {
    if (!linea) return [];
    const produccion =
      linea.velocidadEstandar > 0 ? Math.round(linea.producido / linea.velocidadEstandar) : 0;
    const detenido = Math.round(minutosParados);
    const pendiente = Math.max(0, MINUTOS_TURNO - produccion - detenido);

    const cola: LineSegment[] = pendiente > 0 ? [{ tone: 'idle', weight: pendiente }] : [];

    if (listaParadas.length === 0 || listaParadas.length > MAX_TRAMOS) {
      return [
        ...(produccion > 0 ? [{ tone: 'ok' as const, weight: produccion }] : []),
        ...(detenido > 0 ? [{ tone: 'stop' as const, weight: detenido }] : []),
        ...cola,
      ];
    }

    const tramoOk = Math.max(1, produccion / (listaParadas.length + 1));
    const tramos: LineSegment[] = [];
    for (const parada of [...listaParadas].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
      tramos.push({ tone: 'ok', weight: tramoOk });
      tramos.push({ tone: parada.fin ? 'stop' : 'micro', weight: Math.max(1, parada.duracionMin) });
    }
    tramos.push({ tone: 'ok', weight: tramoOk });
    return [...tramos, ...cola];
  }, [linea, listaParadas, minutosParados]);

  const kpis = React.useMemo<KpiVista[]>(() => {
    if (!linea) return [];
    const avance = linea.plan > 0 ? (linea.producido / linea.plan) * 100 : 0;
    const desvio =
      linea.velocidadEstandar > 0
        ? ((linea.velocidad - linea.velocidadEstandar) / linea.velocidadEstandar) * 100
        : 0;
    return [
      {
        id: 'producido_turno',
        label: 'Producido del turno',
        value: `${formatNumber(linea.producido)} u`,
        trend: 'flat',
        favorable: false,
        delta: formatPct(avance, 0),
        context: `del plan (${formatNumber(linea.plan)} u)`,
      },
      {
        id: 'velocidad_actual',
        label: 'Velocidad actual',
        value: formatSpeed(linea.velocidad),
        trend: desvio === 0 ? 'flat' : desvio > 0 ? 'up' : 'down',
        favorable: desvio >= 0,
        delta: formatDelta(desvio, '%'),
        context: `vs estándar ${formatSpeed(linea.velocidadEstandar)}`,
      },
      {
        id: 'paradas_turno',
        label: 'Paradas del turno',
        value: formatNumber(listaParadas.length),
        trend: 'flat',
        favorable: false,
        delta: formatDurationMin(minutosParados),
        context: 'detenido total',
      },
    ];
  }, [linea, listaParadas.length, minutosParados]);

  const registros = React.useMemo<RegistroPropio[]>(() => {
    if (!habilitado) return [];
    const filas: RegistroPropio[] = [];

    for (const p of listaParadas) {
      filas.push({
        id: p.id,
        fechaIso: p.inicio,
        hora: formatTime(p.inicio),
        tipo: 'Parada',
        detalle: `${p.tipoCausaCodigo} ${p.tipoCausaNombre} · ${formatDurationMin(p.duracionMin)}`,
        estadoLabel: p.fin ? 'Cerrado' : 'En curso',
        estadoColor: p.fin ? 'neutral' : 'critical',
      });
    }

    for (const m of mermas.data?.data ?? []) {
      filas.push({
        id: m.id,
        fechaIso: m.registradaEn,
        hora: formatTime(m.registradaEn),
        tipo: 'Merma',
        detalle: `${m.causaCodigo} ${m.causaNombre} · ${formatKg(m.cantidadKg)} · ${TIPO_MERMA_LABEL[m.tipo]} (${m.tipo})`,
        estadoLabel: m.enviarPasteurizacion ? 'Pendiente' : 'Validado',
        estadoColor: m.enviarPasteurizacion ? 'warning' : 'success',
      });
    }

    for (const v of velocidades.data?.data ?? []) {
      filas.push({
        id: v.id,
        fechaIso: v.registradaEn,
        hora: formatTime(v.registradaEn),
        tipo: 'Velocidad',
        detalle: `${formatSpeed(v.velocidadReal)} · estándar ${formatSpeed(v.velocidadEstandar)} · desvío ${formatDelta(v.desvioPct, '%')}`,
        estadoLabel: 'Validado',
        estadoColor: 'success',
      });
    }

    return filas
      .sort((a, b) => new Date(b.fechaIso).getTime() - new Date(a.fechaIso).getTime())
      .slice(0, limiteRegistros);
  }, [habilitado, listaParadas, mermas.data, velocidades.data, limiteRegistros]);

  const consultas = [tiempoReal, alertas, paradas, mermas, velocidades];

  return {
    tiempoReal: tiempoReal.data,
    linea,
    alerta,
    kpis,
    segmentos,
    registros,
    isPending: consultas.some((c) => c.isPending),
    isError: consultas.some((c) => c.isError),
    refetch: () => consultas.forEach((c) => void c.refetch()),
  };
}
