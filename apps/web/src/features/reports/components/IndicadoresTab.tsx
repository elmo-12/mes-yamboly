'use client';

import * as React from 'react';
import { KpiCard, SectionTitle } from '@mes/ui';
import type { KpiValor, ReporteQuery } from '@mes/types';
import { formatDate, formatDelta, formatNumber } from '@mes/shared';
import { useIndicadores } from '../hooks';
import { ComparativaTurnoTable } from './ComparativaTurnoTable';
import { OeePorLineaChart } from './charts/OeePorLineaChart';
import { TendenciaOeeChart } from './charts/TendenciaOeeChart';
import { TabError, TabSinDatos, TabSkeleton } from './estados';

export interface IndicadoresTabProps {
  query: ReporteQuery;
  onLimpiar: () => void;
}

export function kpiTrend(kpi: KpiValor): 'up' | 'down' | 'flat' {
  if (!kpi.delta || kpi.delta.valor === 0) return 'flat';
  return kpi.delta.valor > 0 ? 'up' : 'down';
}

export function kpiFavorable(kpi: KpiValor): boolean | undefined {
  if (!kpi.delta) return undefined;
  const sube = kpi.delta.valor > 0;
  return kpi.delta.favorableSiSube ? sube : !sube;
}

export function valorKpi(kpi: KpiValor): string {
  const decimales = Number.isInteger(kpi.valor) ? 0 : 1;
  if (kpi.unidad === 'S/') return `S/ ${formatNumber(kpi.valor, decimales)}`;
  return kpi.unidad ? `${formatNumber(kpi.valor, decimales)} ${kpi.unidad}` : formatNumber(kpi.valor);
}

/** `Reportes / Indicadores` (Figma 2163:18418). */
export function IndicadoresTab({ query, onLimpiar }: IndicadoresTabProps) {
  const { data, isPending, isError, refetch } = useIndicadores(query);

  if (isPending) return <TabSkeleton bloques={2} />;
  if (isError) return <TabError onReintentar={() => void refetch()} />;
  if (data.kpis.length === 0 || data.tendenciaOee.length === 0) return <TabSinDatos onLimpiar={onLimpiar} />;

  const rango = `${formatDate(data.desde)} – ${formatDate(data.hasta)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            label={kpi.label}
            value={valorKpi(kpi)}
            trend={kpiTrend(kpi)}
            favorable={kpiFavorable(kpi)}
            delta={kpi.delta ? formatDelta(kpi.delta.valor, kpi.delta.unidad) : undefined}
            context={kpi.delta?.referencia}
          />
        ))}
      </div>

      <SectionTitle
        title="Tendencia OEE diaria"
        description={`OEE diario de las 9 líneas frente a la meta de 85 %. Fuente: registros MES ${rango}.`}
      />
      <TendenciaOeeChart puntos={data.tendenciaOee} subtitle={rango} />

      <SectionTitle
        title="Desglose por línea y turno"
        description="OEE de cada línea frente a la meta de 85 % y comparación de los 2 turnos con el periodo anterior."
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-5">
        <OeePorLineaChart lineas={data.oeePorLinea} subtitle={`${rango} · promedio ponderado`} />
        <ComparativaTurnoTable turnos={data.comparativaTurno} />
      </div>
    </div>
  );
}
