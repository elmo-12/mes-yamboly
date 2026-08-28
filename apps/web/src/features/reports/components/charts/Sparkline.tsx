'use client';

import * as React from 'react';
import { Line, LineChart } from 'recharts';
import { chartColors } from '@/components/charts';

export interface SparklineProps {
  valores: readonly number[];
  /** Tono del trazo: sube = desfavorable en paradas y mermas. */
  tono?: 'primary' | 'success' | 'danger';
  width?: number;
  height?: number;
  label?: string;
}

const TONO = {
  primary: chartColors.primary,
  success: chartColors.success,
  danger: chartColors.danger,
} as const;

/**
 * Mini gráfico de tendencia de la columna "Tendencia 7 días" (Figma 2165:14216)
 * — 80×24 con tamaño fijo: nunca mide el contenedor, así que no emite avisos.
 */
export function Sparkline({
  valores,
  tono = 'primary',
  width = 80,
  height = 24,
  label,
}: SparklineProps) {
  const datos = valores.map((v, i) => ({ i, v }));
  if (datos.length < 2) return <span className="text-body-sm text-text-disabled">—</span>;
  return (
    <span className="inline-flex" role="img" aria-label={label ?? 'Tendencia de los últimos 7 días'}>
      <LineChart width={width} height={height} data={datos} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={TONO[tono]}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </span>
  );
}
