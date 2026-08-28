'use client';

import * as React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DonutSegmento } from '@mes/types';
import { formatNumber, formatPct } from '@mes/shared';
import { ChartFrame, ChartTooltip, chartColors } from '@/components/charts';
import { colorPorClave } from './clasificacion-paradas';

export interface DonutParadasChartProps {
  segmentos: readonly DonutSegmento[];
  /** Número mostrado en el centro del anillo. */
  totalEventos?: number;
}

/**
 * `Chart / Clasificación de paradas` (Figma 2165:13836) — 380×320: donut de
 128 px con el total en el centro y leyenda de tres filas con % y minutos.
 */
export function DonutParadasChart({ segmentos, totalEventos }: DonutParadasChartProps) {
  /* El color depende de la clase de parada, no de la posición en la lista. */
  const datos = segmentos.map((s) => ({ ...s, color: colorPorClave(s.clave) }));
  const totalMin = datos.reduce((a, s) => a + s.valor, 0);

  return (
    <ChartFrame
      title="Clasificación de paradas"
      subtitle={`Distribución de los ${formatNumber(totalMin)} minutos`}
      height={252}
      className="lg:max-w-[380px]"
    >
      <div className="flex h-full flex-col gap-3">
        <div className="relative min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
              <Pie
                data={datos}
                dataKey="valor"
                nameKey="label"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                stroke={chartColors.surface}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {datos.map((s) => (
                  <Cell key={s.clave} fill={s.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip unit="min" hideLabel />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-h2 tabular text-text-primary">
              {formatNumber(totalEventos ?? datos.length)}
            </span>
            <span className="text-body-sm text-text-secondary">paradas</span>
          </div>
        </div>
        <ul className="flex flex-col gap-1.5">
          {datos.map((s) => (
            <li key={s.clave} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-xs"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">
                {s.label}
              </span>
              <span className="shrink-0 text-body-sm tabular text-text-secondary">
                {formatPct(s.pct)} · {formatNumber(s.valor)} min
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}
