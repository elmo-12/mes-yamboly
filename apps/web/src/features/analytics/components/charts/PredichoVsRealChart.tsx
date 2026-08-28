'use client';

import * as React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PrediccionPunto } from '@mes/types';
import { formatNumber } from '@mes/shared';
import {
  ChartFrame,
  ChartTooltip,
  chartAxis,
  chartColors,
  chartGrid,
  chartMargin,
} from '@/components/charts';

export interface PredichoVsRealChartProps {
  serie: readonly PrediccionPunto[];
}

/**
 * `Chart / Predicho vs real` (Figma 2163:11676) — 1116×312 sobre la página:
 * dos líneas de 2 px (predicho `primary/hover`, real gris `text/disabled`) con
 * el eje X en días y leyenda al pie.
 */
export function PredichoVsRealChart({ serie }: PredichoVsRealChartProps) {
  const max = serie.reduce((m, p) => Math.max(m, p.predicho, p.real), 0);

  return (
    <ChartFrame
      bordered={false}
      title="Predicho vs real · paradas por día (últimos 30 días)"
      subtitle="Serie predicha por el modelo frente a las paradas realmente registradas en planta"
      height={264}
      legend={[
        { label: 'Predicho por el modelo', color: 'primaryDark', shape: 'line' },
        { label: 'Real registrado', color: 'reference', shape: 'line' },
      ]}
      footer="Paradas registradas por día"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={serie as PrediccionPunto[]} margin={{ ...chartMargin, left: 0 }}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="etiqueta" {...chartAxis} minTickGap={24} />
          <YAxis
            {...chartAxis}
            width={40}
            domain={[0, Math.ceil((max + 2) / 4) * 4]}
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <Tooltip
            cursor={{ stroke: chartColors.axisLine, strokeWidth: 1 }}
            content={<ChartTooltip unit="paradas" />}
          />
          <Line
            type="monotone"
            dataKey="predicho"
            name="Predicho por el modelo"
            stroke={chartColors.primaryDark}
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="real"
            name="Real registrado"
            stroke={chartColors.reference}
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
