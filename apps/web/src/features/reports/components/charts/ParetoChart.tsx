'use client';

import * as React from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ParetoParada } from '@mes/types';
import { formatNumber } from '@mes/shared';
import {
  ChartFrame,
  ChartLegendItem,
  ChartTooltip,
  axisProps,
  chartColors,
  chartMargin,
  gridProps,
} from '@/components/charts';
import {
  CLASE_PARADA_COLOR,
  CLASE_PARADA_LABEL,
  colorPorCausa,
  type ClaseParada,
} from './clasificacion-paradas';

export interface ParetoChartProps {
  causas: readonly ParetoParada[];
}

/**
 * `Chart / Pareto de paradas` (Figma 2165:13788) — 720×320: barras de minutos
 * por causa (la causa dominante en `error`, el resto en `primary`) y curva de
 * porcentaje acumulado en gris sobre el eje derecho.
 *
 * Es la única excepción admitida a la regla de "un solo eje": el diagrama de
 * Pareto define por norma (ISO/Juran) barras + acumulado 0–100 %.
 */
export function ParetoChart({ causas }: ParetoChartProps) {
  const datos = causas.map((c) => ({
    causa: c.causaCodigo,
    nombre: c.causaNombre,
    minutos: c.minutos,
    acumulado: c.acumuladoPct,
  }));
  const maxMinutos = Math.max(...datos.map((d) => d.minutos), 1);
  const techo = Math.ceil(maxMinutos / 50) * 50;
  const ticksMinutos = Array.from({ length: techo / 50 + 1 }, (_, i) => i * 50);
  const tresPrimeras = datos.slice(0, 3).reduce((a, d) => a + d.minutos, 0);
  const total = datos.reduce((a, d) => a + d.minutos, 0);

  return (
    <ChartFrame
      title="Pareto de causas de parada"
      subtitle="Minutos perdidos por causa (barras) y % acumulado (línea)"
      height={252}
      legend={
        <>
          {(Object.keys(CLASE_PARADA_LABEL) as ClaseParada[]).map((c) => (
            <ChartLegendItem key={c} color={CLASE_PARADA_COLOR[c]} label={CLASE_PARADA_LABEL[c]} />
          ))}
          <ChartLegendItem color={chartColors.reference} label="% acumulado" shape="line" />
        </>
      }
      footer={
        total > 0
          ? `${formatNumber(Math.round((tresPrimeras / total) * 100))} % acumulado en 3 causas`
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={datos} margin={{ ...chartMargin, left: 0, right: 8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="causa" {...axisProps} interval={0} />
          <YAxis
            yAxisId="minutos"
            {...axisProps}
            width={44}
            domain={[0, techo]}
            ticks={ticksMinutos}
          />
          <YAxis
            yAxisId="acumulado"
            orientation="right"
            {...axisProps}
            width={48}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v} %`}
          />
          <Tooltip
            cursor={{ fill: chartColors.grid }}
            content={
              <ChartTooltip
                formatValue={(value, name) =>
                  name === '% acumulado'
                    ? `${formatNumber(value, 1)} %`
                    : `${formatNumber(value)} min`
                }
              />
            }
          />
          <Bar
            yAxisId="minutos"
            dataKey="minutos"
            name="Minutos"
            radius={[4, 4, 0, 0]}
            maxBarSize={60}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="minutos"
              position="top"
              offset={6}
              fill={chartColors.axis}
              fontSize={11}
              formatter={(v: number) => formatNumber(v)}
            />
            {datos.map((d) => (
              <Cell key={d.causa} fill={colorPorCausa(d.causa)} />
            ))}
          </Bar>
          <Line
            yAxisId="acumulado"
            type="monotone"
            dataKey="acumulado"
            name="% acumulado"
            stroke={chartColors.reference}
            strokeWidth={2}
            isAnimationActive={false}
            dot={{ r: 3, fill: chartColors.surface, stroke: chartColors.reference, strokeWidth: 2 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
