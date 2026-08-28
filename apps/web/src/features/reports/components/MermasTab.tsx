'use client';

import * as React from 'react';
import { Badge, KpiCard, SectionTitle, TBody, TCell, TH, THead, TRow, Table } from '@mes/ui';
import type { ReporteQuery, TipoMermaCodigo } from '@mes/types';
import { TIPO_MERMA_LABEL } from '@mes/types';
import { formatCurrency, formatDelta, formatKg, formatNumber, formatPct } from '@mes/shared';
import { useReporteMermas } from '../hooks';
import { HeatmapCausaTurno } from './charts/HeatmapCausaTurno';
import { MermasApiladasChart } from './charts/MermasApiladasChart';
import { TabError, TabSinDatos, TabSkeleton } from './estados';
import { kpiFavorable, kpiTrend, valorKpi } from './IndicadoresTab';

export interface MermasTabProps {
  query: ReporteQuery;
  onLimpiar: () => void;
}

const TIPO_COLOR: Record<TipoMermaCodigo, 'informational' | 'accent' | 'warning'> = {
  MP: 'informational',
  EP: 'accent',
  PT: 'warning',
};

/** `Reportes / Mermas` (Figma 2163:19459). */
export function MermasTab({ query, onLimpiar }: MermasTabProps) {
  const { data, isPending, isError, refetch } = useReporteMermas(query);

  if (isPending) return <TabSkeleton bloques={2} />;
  if (isError) return <TabError onReintentar={() => void refetch()} />;
  if (data.apiladasPorLinea.length === 0) return <TabSinDatos onLimpiar={onLimpiar} />;

  const costoTotal = data.kpis.find((k) => k.unidad === 'S/')?.valor ?? 0;

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
        title="Mermas por línea y tipo"
        description="Kilogramos registrados en el periodo. La merma en proceso (EP) se recupera vía pasteurización."
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-4">
        <MermasApiladasChart lineas={data.apiladasPorLinea} />
        <HeatmapCausaTurno celdas={data.heatmap} etiquetaFila="codigo" />
      </div>

      <SectionTitle
        title="Detalle por causa de merma"
        description="Causas codificadas MR-01…MR-04. El costo estimado reparte el costo del periodo según el peso de cada causa."
      />
      <Table density="dense">
        <THead>
          <TRow plain>
            <TH>Código</TH>
            <TH>Causa</TH>
            <TH>Tipo</TH>
            <TH numeric>Kilogramos</TH>
            <TH numeric>% del total</TH>
            <TH>Línea más afectada</TH>
            <TH numeric>Costo estimado</TH>
          </TRow>
        </THead>
        <TBody>
          {data.tabla.map((c) => (
            <TRow key={c.causaId}>
              <TCell className="font-medium tabular">{c.causaCodigo}</TCell>
              <TCell>{c.causaNombre}</TCell>
              <TCell>
                <Badge color={TIPO_COLOR[c.tipoPredominante]}>
                  {c.tipoPredominante} · {TIPO_MERMA_LABEL[c.tipoPredominante]}
                </Badge>
              </TCell>
              <TCell numeric className="font-medium">
                {formatKg(c.kg)}
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
              <TCell numeric>{formatCurrency(Math.round((costoTotal * c.pct) / 100))}</TCell>
            </TRow>
          ))}
        </TBody>
      </Table>
      <p className="text-body-sm text-text-secondary">
        {formatNumber(data.tabla.length)} causas codificadas ·{' '}
        {formatKg(data.tabla.reduce((a, c) => a + c.kg, 0))} · costo estimado{' '}
        {formatCurrency(costoTotal)}
      </p>
    </div>
  );
}
