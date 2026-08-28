'use client';

import * as React from 'react';
import { cn } from '@mes/ui';
import { chartColors } from './chartTheme';

/** Entrada declarativa de leyenda: el color puede ser una clave de `chartColors` o un hex. */
export interface ChartLegendEntry {
  label: React.ReactNode;
  color: string;
  shape?: 'square' | 'line' | 'dashed';
}

function resolverColor(color: string): string {
  return (chartColors as Record<string, string>)[color] ?? color;
}

export interface ChartFrameProps {
  /** Título H4 del gráfico. */
  title?: React.ReactNode;
  /** Descripción 12/400 bajo el título. */
  subtitle?: React.ReactNode;
  /**
   * Leyenda alineada a la derecha del título. Acepta nodos propios o una lista
   * declarativa `{ label, color, shape }` (el color puede ser clave de
   * `chartColors` o un hex).
   */
  legend?: React.ReactNode | readonly ChartLegendEntry[];
  /** Nota corta a la derecha del título, p. ej. "Meta 85 %" (11/500 `text/disabled`). */
  note?: React.ReactNode;
  /** Alto del área de plot en px (sin cabecera). El contenedor es responsive en ancho. */
  height?: number;
  /** Nota al pie: unidad del eje, valor máximo, anotación. */
  footer?: React.ReactNode;
  /**
   * Marco 1 px `border` radio 12 como en los frames `Chart / …` de Figma.
   * `false` para los gráficos que viven directamente sobre la página
   * (Analítica · Riesgo por línea y Predicho vs real).
   */
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Contenedor de gráfico MES. **No es una card**: no lleva sombra y solo aporta
 * el marco de 1 px que usan los frames `Chart / …` (Figma 2163:20233,
 * 2165:12856, 2165:13788, 2166:4340). El alto del área de plot es fijo para que
 * `ResponsiveContainer` nunca mida 0.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  note,
  height = 240,
  footer,
  bordered = true,
  className,
  children,
}: ChartFrameProps) {
  /* La leyenda admite nodos ya construidos o una lista declarativa. */
  const esDeclarativa =
    Array.isArray(legend) && legend.length > 0 && !React.isValidElement(legend[0]);
  const leyenda = esDeclarativa
    ? (legend as readonly ChartLegendEntry[]).map((e, i) => (
        <ChartLegendItem
          key={`${String(e.label)}-${i}`}
          color={resolverColor(e.color)}
          label={e.label}
          shape={e.shape}
        />
      ))
    : (legend as React.ReactNode);
  const conCabecera = Boolean(title || subtitle || legend || note);
  return (
    <figure
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-3 rounded-md p-4',
        bordered ? 'border border-border bg-background-main' : 'p-0',
        className,
      )}
    >
      {conCabecera && (
        <figcaption className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            {title && <span className="text-h4 text-text-primary">{title}</span>}
            {subtitle && <span className="text-body-sm text-text-secondary">{subtitle}</span>}
          </div>
          {/* `min-w-0` + sin `shrink-0`: en móvil la leyenda envuelve dentro
              del ancho de la página en vez de desbordarla. */}
          {(legend || note) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 sm:shrink-0">
              {leyenda}
              {note && <span className="text-caption text-text-disabled">{note}</span>}
            </div>
          )}
        </figcaption>
      )}
      <div className="w-full min-w-0" style={{ height }}>
        {children}
      </div>
      {footer && <p className="text-body-sm text-text-secondary">{footer}</p>}
    </figure>
  );
}

export interface ChartLegendItemProps {
  color: string;
  label: React.ReactNode;
  /** `line` dibuja un trazo de 16×3; `dashed` lo dibuja punteado. */
  shape?: 'square' | 'line' | 'dashed';
}

/** Entrada de leyenda: swatch 10×10 (o trazo 16×3) + etiqueta 12/500. */
export function ChartLegendItem({ color, label, shape = 'square' }: ChartLegendItemProps) {
  return (
    <span className="flex items-center gap-2">
      {shape === 'square' ? (
        <span
          className="size-2.5 shrink-0 rounded-xs"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : (
        <span
          className="h-[3px] w-4 shrink-0 rounded-xs"
          style={
            shape === 'dashed'
              ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` }
              : { backgroundColor: color }
          }
          aria-hidden
        />
      )}
      <span className="text-body-sm font-medium text-text-secondary">{label}</span>
    </span>
  );
}
