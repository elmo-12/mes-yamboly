'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MermaApiladaLinea } from '@mes/types';
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

export interface MermasApiladasChartProps {
  lineas: readonly MermaApiladaLinea[];
}

/** MP / EP / PT con el orden y los colores del frame (Figma 2166:4340). */
const TIPOS = [
  { key: 'MP', label: 'MP · Materia prima', color: chartColors.primary },
  { key: 'EP', label: 'EP · En proceso', color: chartColors.primaryDark },
  { key: 'PT', label: 'PT · Terminado', color: chartColors.warning },
] as const;

/**
 * `Chart / Merma por línea y tipo` (Figma 2166:4340) — 720×372: barras
 * apiladas por línea con separación de 2 px entre segmentos y el total encima.
 */
export function MermasApiladasChart({ lineas }: MermasApiladasChartProps) {
  const datos = lineas.map((l) => ({
    linea: `${l.lineaCodigo} · ${l.lineaNombre}`,
    MP: l.MP,
    EP: l.EP,
    PT: l.PT,
    total: l.total,
  }));

  return (
    <ChartFrame
      title="Merma por línea y tipo"
      subtitle="Kilogramos acumulados · MP materia prima · EP en proceso · PT terminado"
      height={280}
      legend={TIPOS.map((t) => (
        <ChartLegendItem key={t.key} color={t.color} label={t.key} />
      ))}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={datos} margin={{ ...chartMargin, top: 20, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="linea" {...axisProps} interval={0} />
          <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip
            cursor={{ fill: chartColors.grid }}
            content={<ChartTooltip unit="kg" />}
          />
          {TIPOS.map((t, i) => (
            <Bar
              key={t.key}
              dataKey={t.key}
              name={t.label}
              stackId="merma"
              fill={t.color}
              maxBarSize={70}
              isAnimationActive={false}
              radius={i === TIPOS.length - 1 ? [4, 4, 0, 0] : undefined}
              /* separación de 2 px entre segmentos apilados (regla de marcas) */
              stroke={chartColors.surface}
              strokeWidth={2}
            >
              {i === TIPOS.length - 1 && (
                <LabelList
                  dataKey="total"
                  position="top"
                  offset={8}
                  className="tabular"
                  fill={chartColors.axis}
                  fontSize={12}
                  formatter={(v: number) => `${formatNumber(v)} kg`}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
