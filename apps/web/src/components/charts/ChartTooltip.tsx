'use client';

import * as React from 'react';
import type { TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

export interface ChartTooltipProps extends TooltipProps<ValueType, NameType> {
  /** Sufijo de las magnitudes (`%`, `min`, `kg`). */
  unit?: string;
  /** Formateador propio del valor; tiene prioridad sobre `unit`. */
  formatValue?: (value: number, name: string) => string;
  /** Oculta el encabezado con la etiqueta del eje X. */
  hideLabel?: boolean;
}

const NBSP = ' ';

/**
 * Tooltip MDS de los gráficos: superficie blanca, borde 1 px `border`,
 * radio 12 y `Shadow/Dropdown` (única sombra permitida: es un flotante).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit,
  formatValue,
  hideLabel = false,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const format = (value: number, name: string): string => {
    if (formatValue) return formatValue(value, name);
    const texto = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(value);
    return unit ? `${texto}${NBSP}${unit}` : texto;
  };

  return (
    <div className="pointer-events-none min-w-40 rounded-md border border-border bg-background-main p-3 shadow-dropdown">
      {!hideLabel && label !== undefined && (
        <p className="mb-2 text-body-sm font-medium text-text-primary">{String(label)}</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {payload.map((item, i) => (
          <li key={`${String(item.name)}-${i}`} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-xs"
              style={{ backgroundColor: item.color ?? undefined }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">
              {String(item.name ?? '')}
            </span>
            <span className="shrink-0 text-body-sm font-medium tabular text-text-primary">
              {format(Number(item.value ?? 0), String(item.name ?? ''))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
