'use client';

import * as React from 'react';
import type { OeePorLinea } from '@mes/types';
import { formatPct } from '@mes/shared';
import { ChartFrame, chartColors } from '@/components/charts';

export interface OeePorLineaChartProps {
  lineas: readonly OeePorLinea[];
  /** Meta de OEE en %; dibuja la vertical punteada. */
  meta?: number;
  subtitle?: string;
}

/**
 * `Chart / OEE por línea` (Figma 2165:12856) — barras horizontales: etiqueta,
 * track `divider` r4 de 14 px de alto, relleno proporcional (`success` cuando
 * la línea alcanza la meta) y valor a la derecha. Vertical punteada en la meta.
 *
 * Se dibuja con CSS —como en Figma— en vez de recharts: la geometría es una
 * lista de barras, no un plano cartesiano, y así no hay medición de ancho.
 */
export function OeePorLineaChart({ lineas, meta = 85, subtitle }: OeePorLineaChartProps) {
  const alto = Math.max(160, lineas.length * 42);
  return (
    <ChartFrame
      title="OEE por línea"
      subtitle={subtitle ?? 'Promedio ponderado del periodo'}
      height={alto}
    >
      <div className="relative flex h-full flex-col justify-between">
        <span
          className="pointer-events-none absolute top-0 bottom-5 hidden w-px border-l border-dashed border-warning sm:block"
          style={{ left: `calc(124px + (100% - 192px) * ${meta / 100})` }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -top-3 hidden text-caption font-semibold text-warning-text sm:block"
          style={{ left: `calc(124px + (100% - 192px) * ${meta / 100} - 28px)` }}
        >
          Meta {formatPct(meta, 0)}
        </span>
        {lineas.map((l) => {
          const cumple = l.oee >= meta;
          return (
            <div key={l.lineaId} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-body-sm font-medium text-text-primary">
                {l.lineaCodigo} · {l.lineaNombre}
              </span>
              <span className="relative h-3.5 min-w-0 flex-1 rounded-xs bg-divider">
                <span
                  className="absolute inset-y-0 left-0 rounded-xs"
                  style={{
                    width: `${Math.min(100, l.oee)}%`,
                    backgroundColor: cumple ? chartColors.success : chartColors.primary,
                  }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-body-sm font-semibold tabular text-text-primary">
                {formatPct(l.oee)}
              </span>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}
