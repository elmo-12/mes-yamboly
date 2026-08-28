'use client';

import * as React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TendenciaOeePunto } from '@mes/types';
import { formatPct } from '@mes/shared';
import {
  ChartFrame,
  ChartLegendItem,
  ChartTooltip,
  axisProps,
  chartColors,
  chartMargin,
  gridProps,
  referenceLineProps,
} from '@/components/charts';

export interface TendenciaOeeChartProps {
  puntos: readonly TendenciaOeePunto[];
  /** Meta de OEE en %. Se toma del primer punto si no se indica. */
  meta?: number;
  subtitle?: string;
}

/**
 * `Chart / Tendencia OEE diaria` (Figma 2163:20233) — 1116×264: área suave
 * `primary` con puntos 9 px, retícula horizontal `divider`, línea base
 * `border`, eje X con las 7 fechas y línea de meta punteada `warning`.
 */
export function TendenciaOeeChart({ puntos, meta, subtitle }: TendenciaOeeChartProps) {
  const metaValor = meta ?? puntos[0]?.meta ?? 85;
  const valores = puntos.map((p) => p.oee);
  const min = Math.min(...valores, metaValor);
  const max = Math.max(...valores, metaValor);
  const inferior = Math.max(0, Math.floor((min - 10) / 10) * 10);
  const superior = Math.min(100, Math.ceil((max + 5) / 10) * 10);
  const ticks = Array.from(
    { length: Math.round((superior - inferior) / 10) + 1 },
    (_, i) => inferior + i * 10,
  );

  return (
    <ChartFrame
      subtitle={subtitle}
      height={224}
      legend={
        <>
          <ChartLegendItem color={chartColors.primary} label="OEE diario" shape="line" />
          <ChartLegendItem
            color={chartColors.warning}
            label={`Meta ${formatPct(metaValor, 0)}`}
            shape="dashed"
          />
        </>
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={puntos as TendenciaOeePunto[]} margin={{ ...chartMargin, left: 8 }}>
          <defs>
            <linearGradient id="grad-oee" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.primary} stopOpacity={0.18} />
              <stop offset="100%" stopColor={chartColors.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="etiqueta" {...axisProps} />
          <YAxis
            {...axisProps}
            domain={[inferior, superior]}
            ticks={ticks}
            width={48}
            tickFormatter={(v: number) => formatPct(v, 0)}
          />
          <ReferenceLine
            y={metaValor}
            stroke={chartColors.warning}
            {...referenceLineProps}
            ifOverflow="extendDomain"
          />
          <Tooltip
            cursor={{ stroke: chartColors.axisLine, strokeWidth: 1 }}
            content={<ChartTooltip unit="%" />}
          />
          <Area
            type="monotone"
            dataKey="oee"
            name="OEE diario"
            stroke={chartColors.primary}
            strokeWidth={2}
            fill="url(#grad-oee)"
            isAnimationActive={false}
            dot={{ r: 4, fill: chartColors.surface, stroke: chartColors.primary, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: chartColors.primary, stroke: chartColors.surface, strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
