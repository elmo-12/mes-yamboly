'use client';

import * as React from 'react';
import { Badge, type BadgeColor } from '@mes/ui';
import type { RiesgoLinea } from '@mes/types';
import { TURNO_LABEL } from '@mes/types';
import { formatPct } from '@mes/shared';
import { ChartFrame, chartColors } from '@/components/charts';

export interface RiesgoPorLineaChartProps {
  lineas: readonly RiesgoLinea[];
  /** Umbral de alerta en % (vertical punteada `error`). */
  umbral?: number;
}

/** Escala de riesgo del MDS: ≥70 crítico · 50–69 atención · <50 neutro. */
export function colorRiesgo(riesgo: number): BadgeColor {
  if (riesgo >= 70) return 'critical';
  if (riesgo >= 50) return 'warning';
  return 'neutral';
}

/**
 * `Chart / Riesgo por línea` (Figma 2156:6721) — sobre la página, sin marco:
 * etiqueta 140, track 20 px `background/subtle` r4, relleno `primary` (el
 * color no codifica la severidad: eso lo dice el Badge) y umbral punteado.
 */
export function RiesgoPorLineaChart({ lineas, umbral = 60 }: RiesgoPorLineaChartProps) {
  const turno = lineas[0]?.turnoObjetivo;
  const orden = [...lineas].sort((a, b) => b.riesgo - a.riesgo);

  return (
    <ChartFrame
      bordered={false}
      title={`Riesgo de parada por línea · próximo turno${turno ? ` (${TURNO_LABEL[turno]})` : ''}`}
      subtitle="Probabilidad estimada por el modelo a partir de 14 variables de proceso"
      height={Math.max(180, orden.length * 36 + 56)}
      footer="Probabilidad de parada durante el turno"
    >
      <div className="relative flex h-full flex-col justify-between pt-6">
        <span
          className="pointer-events-none absolute top-5 bottom-0 hidden w-px border-l border-dashed border-error sm:block"
          style={{ left: `calc(140px + (100% - 260px) * ${umbral / 100})` }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute top-0 hidden text-body-sm whitespace-nowrap text-error-text sm:block"
          style={{ left: `calc(140px + (100% - 260px) * ${umbral / 100} + 6px)` }}
        >
          Umbral de alerta {formatPct(umbral, 0)}
        </span>
        {orden.map((l) => (
          <div key={l.lineaId} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-body text-neutral-text" title={l.causaProbable}>
              {l.lineaCodigo} · {l.lineaNombre}
            </span>
            <span className="relative h-5 min-w-0 flex-1 rounded-xs bg-background-subtle">
              <span
                className="absolute inset-y-0 left-0 rounded-xs"
                style={{ width: `${Math.min(100, l.riesgo)}%`, backgroundColor: chartColors.primary }}
              />
            </span>
            <span className="w-24 shrink-0 text-right">
              <Badge color={colorRiesgo(l.riesgo)}>Riesgo {formatPct(l.riesgo, 0)}</Badge>
            </span>
          </div>
        ))}
        {/* Escala del eje X, alineada con el track (Figma 2156:6785). */}
        <div className="mt-1 flex items-center gap-3">
          <span className="w-32 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 justify-between">
            {[0, 25, 50, 75, 100].map((t) => (
              <span key={t} className="text-body-sm tabular text-text-disabled">
                {formatPct(t, 0)}
              </span>
            ))}
          </div>
          <span className="w-24 shrink-0" aria-hidden />
        </div>
      </div>
    </ChartFrame>
  );
}
