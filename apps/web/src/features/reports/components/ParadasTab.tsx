'use client';

import * as React from 'react';
import { KpiCard, SectionTitle, TBody, TCell, TH, THead, TRow, Table } from '@mes/ui';
import type { DetalleCausaParada, ReporteQuery } from '@mes/types';
import { formatDelta, formatNumber, formatPct } from '@mes/shared';
import { useReporteParadas } from '../hooks';
import { DonutParadasChart } from './charts/DonutParadasChart';
import { ParetoChart } from './charts/ParetoChart';
import { Sparkline } from './charts/Sparkline';
import { TabError, TabSinDatos, TabSkeleton } from './estados';
import { kpiFavorable, kpiTrend, valorKpi } from './IndicadoresTab';

export interface ParadasTabProps {
  query: ReporteQuery;
  onLimpiar: () => void;
}

/** Variación entre el primer y el último día de la serie de tendencia. */
function variacion(causa: DetalleCausaParada): number {
  const t = causa.tendencia;
  if (t.length < 2) return 0;
  return (t.at(-1) ?? 0) - (t[0] ?? 0);
}

/** `Reportes / Paradas` (Figma 2163:18594). */
export function ParadasTab({ query, onLimpiar }: ParadasTabProps) {
  const { data, isPending, isError, refetch } = useReporteParadas(query);

  if (isPending) return <TabSkeleton bloques={2} />;
  if (isError) return <TabError onReintentar={() => void refetch()} />;
  if (data.pareto.length === 0) return <TabSinDatos onLimpiar={onLimpiar} />;

  const totalEventos = data.detallePorCausa.reduce((a, c) => a + c.cantidad, 0);
  const totalMinutos = data.detallePorCausa.reduce((a, c) => a + c.minutos, 0);

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
        title="Análisis de paradas"
        description="Diagrama de Pareto de las causas codificadas y clasificación por tipo."
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-4">
        <ParetoChart causas={data.pareto} />
        <DonutParadasChart segmentos={data.donut} totalEventos={totalEventos} />
      </div>

      <SectionTitle
        title="Detalle por causa"
        description="Causas codificadas registradas en el periodo. La tendencia compara con los 7 días previos."
      />
      <Table density="dense">
        <THead>
          <TRow plain>
            <TH>Código</TH>
            <TH>Causa</TH>
            <TH numeric>N°</TH>
            <TH numeric>Minutos</TH>
            <TH numeric>% del total</TH>
            <TH>Línea más afectada</TH>
            <TH>Tendencia 7 días</TH>
          </TRow>
        </THead>
        <TBody>
          {data.detallePorCausa.map((c) => {
            const delta = variacion(c);
            return (
              <TRow key={c.causaId}>
                <TCell className="font-medium tabular">{c.causaCodigo}</TCell>
                <TCell>{c.causaNombre}</TCell>
                <TCell numeric>{formatNumber(c.cantidad)}</TCell>
                <TCell numeric className="font-medium">
                  {formatNumber(c.minutos)} min
                </TCell>
                <TCell numeric>
                  <span className="flex items-center justify-end gap-2">
                    <span className="hidden h-1 w-24 rounded-xs bg-divider sm:block">
                      <span
                        className="block h-full rounded-xs bg-primary"
                        style={{ width: `${Math.min(100, c.pct)}%` }}
                      />
                    </span>
                    <span className="w-12 text-right">{formatPct(c.pct)}</span>
                  </span>
                </TCell>
                <TCell muted>{c.lineaMasAfectada}</TCell>
                <TCell>
                  <span className="flex items-center gap-2">
                    <Sparkline
                      valores={c.tendencia}
                      tono={delta > 0 ? 'danger' : 'success'}
                      label={`Tendencia de ${c.causaNombre}`}
                    />
                    <span
                      className={
                        delta === 0
                          ? 'text-body-sm text-text-secondary'
                          : delta > 0
                            ? 'text-body-sm font-medium text-error-text'
                            : 'text-body-sm font-medium text-success-text'
                      }
                    >
                      {delta === 0 ? 'sin cambio' : `${formatDelta(delta, 'min', 0)}`}
                    </span>
                  </span>
                </TCell>
              </TRow>
            );
          })}
        </TBody>
      </Table>
      <p className="text-body-sm text-text-secondary">
        {formatNumber(data.detallePorCausa.length)} causas codificadas ·{' '}
        {formatNumber(totalEventos)} eventos · {formatNumber(totalMinutos)} minutos perdidos
      </p>
    </div>
  );
}
