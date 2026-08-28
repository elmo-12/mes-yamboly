'use client';

import type { ParetoParada } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { CHART_HEIGHT, ChartFrame, chartColors } from '@/components/charts';

export interface TopCausasTableProps {
  datos: readonly ParetoParada[];
  /** Número de causas mostradas (5 en el frame de Home). */
  limite?: number;
  title?: string;
}

/**
 * Panel de ranking del Home (Figma 2163:19421 · design-system §7): 380×272.
 * Cada entrada es cabecera (causa + minutos) + barra de 4 px proporcional al
 * máximo de la serie. Sobre la página, sin marco.
 */
export function TopCausasTable({
  datos,
  limite = 5,
  title = 'Top causas de parada (semana)',
}: TopCausasTableProps) {
  const filas = datos.slice(0, limite);
  const maximo = Math.max(1, ...filas.map((c) => c.minutos));

  return (
    /* Con marco 1 px r12 como en `Home / Dashboard Jefe` (Figma 2163:17435). */
    <ChartFrame
      title={title}
      height={CHART_HEIGHT.panel}
      className="min-w-0 flex-[380_1_0] basis-0"
    >
      <ol className="flex h-full flex-col gap-3.5">
        {filas.map((causa) => (
          <li key={causa.causaCodigo} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-body-sm text-neutral-text">
                <span className="font-medium text-text-primary">{causa.causaCodigo}</span>{' '}
                {causa.causaNombre}
              </span>
              <span className="shrink-0 text-body-sm font-semibold tabular text-text-primary">
                {formatNumber(causa.minutos)} min
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-xs bg-divider">
              <div
                className="h-full rounded-xs"
                style={{
                  width: `${(causa.minutos / maximo) * 100}%`,
                  backgroundColor: chartColors.primary,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}
