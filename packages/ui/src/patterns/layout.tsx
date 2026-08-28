'use client';

import * as React from 'react';
import { cn } from '../utils/cn';

/* -------------------------------------------------------------- StickyFooter */

export interface StickyFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Texto de estado, "Cambios sin guardar" por defecto. */
  message?: React.ReactNode;
  actions: React.ReactNode;
}

/** Sticky footer 1180×64 de las páginas de formulario (Shadow/FloatingNav). */
export function StickyFooter({
  message = 'Cambios sin guardar',
  actions,
  className,
  ...props
}: StickyFooterProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-(--z-sticky) flex h-topbar w-full max-w-app items-center justify-between gap-4',
        'border-t border-border bg-background-main px-6 shadow-floatingnav',
        className,
      )}
      {...props}
    >
      <p className="text-body-sm text-text-secondary">{message}</p>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

/* ---------------------------------------------------------- ListDetailLayout */

export interface ListDetailLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Columna izquierda 360 px. */
  list: React.ReactNode;
  detail: React.ReactNode;
  /**
   * ADITIVO (V3, Configuración 2163:18282): clases del panel de lista, para
   * que en tablet/móvil pase a ancho completo sin borde derecho. Sin este
   * prop el layout se comporta exactamente igual que antes.
   */
  listClassName?: string;
  detailClassName?: string;
}

/** Layout lista-detalle (Configuración): columna 360 + panel de detalle. */
export function ListDetailLayout({
  list,
  detail,
  listClassName,
  detailClassName,
  className,
  ...props
}: ListDetailLayoutProps) {
  return (
    <div className={cn('flex min-h-0 w-full items-stretch gap-8', className)} {...props}>
      {/* `max-w-full`: en móvil la columna de 360 nunca supera el ancho útil. */}
      <aside
        className={cn('w-list-pane max-w-full shrink-0 border-r border-divider pr-8', listClassName)}
      >
        {list}
      </aside>
      <div className={cn('min-w-0 flex-1', detailClassName)}>{detail}</div>
    </div>
  );
}

/* ----------------------------------------------------------- DescriptionList */

export interface DescriptionItem {
  label: React.ReactNode;
  value: React.ReactNode;
}

export interface DescriptionListProps extends React.HTMLAttributes<HTMLDListElement> {
  items: readonly DescriptionItem[];
  /** Ancho de la columna de etiquetas. */
  labelWidth?: number;
}

/** Filas label/valor con divisores — patrón Settings / Record detail del MDS. */
export function DescriptionList({
  items,
  labelWidth = 220,
  className,
  ...props
}: DescriptionListProps) {
  return (
    <dl className={cn('w-full', className)} {...props}>
      {items.map((it, i) => (
        <div
          key={i}
          className="flex flex-wrap items-start gap-x-6 gap-y-1 border-b border-divider py-3 last:border-b-0"
        >
          {/* Por debajo de `sm` la etiqueta ocupa la fila completa y el valor
              baja de línea, en vez de forzar el ancho de la página. */}
          <dt
            className="shrink-0 text-body text-text-secondary max-sm:w-full!"
            style={{ width: labelWidth }}
          >
            {it.label}
          </dt>
          <dd className="min-w-0 flex-1 text-body text-text-primary">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------- Heatmap cell */

export interface HeatmapCellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Valor a representar. */
  value: number;
  /** Máximo de la serie, para calcular el paso. */
  max: number;
  label?: string;
}

/** Escala de 5 pasos de `primary/subtle` a `primary` (heatmap causa × turno). */
const HEAT_STEPS = [
  'bg-background-subtle text-text-secondary',
  'bg-primary-subtle text-info-text',
  'bg-primary-subtle-fill text-info-text',
  'bg-primary-subtle-border text-info-text',
  'bg-primary text-primary-foreground',
] as const;

export function heatmapStep(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(4, Math.max(0, Math.ceil((value / max) * 5) - 1));
}

export function HeatmapCell({ value, max, label, className, ...props }: HeatmapCellProps) {
  const step = heatmapStep(value, max);
  return (
    <div
      title={label}
      className={cn(
        'grid h-11 place-items-center rounded-xs text-body-sm font-medium tabular',
        HEAT_STEPS[step],
        className,
      )}
      {...props}
    >
      {value}
    </div>
  );
}

/* ------------------------------------------------------------------ Timeline */

export interface TimelineEvent {
  time: string;
  /** Segunda línea bajo la hora (fecha corta) — bitácora de la OF. */
  timeMeta?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Texto secundario bajo la descripción (origen, dispositivo, confianza). */
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
  /**
   * Sustituye el punto de 8 px por un elemento propio (p. ej. `<Avatar />` en
   * la bitácora de la orden, Figma 2163:12196). Aditivo: sin `marker` el
   * Timeline se dibuja igual que antes.
   */
  marker?: React.ReactNode;
}

const DOT_TONE = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  neutral: 'bg-border-strong',
} as const;

export interface TimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  events: readonly TimelineEvent[];
}

/** Timeline vertical: hora, punto, texto y badge (bitácora / detalle de línea). */
export function Timeline({ events, className, ...props }: TimelineProps) {
  return (
    <ol className={cn('flex flex-col', className)} {...props}>
      {events.map((e, i) => {
        const last = i === events.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex w-12 shrink-0 flex-col pt-0.5">
              <span className="text-body-sm tabular text-text-primary">{e.time}</span>
              {e.timeMeta && (
                <span className="text-caption tabular text-text-disabled">{e.timeMeta}</span>
              )}
            </div>
            <div className="flex flex-col items-center">
              {e.marker ?? (
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-pill',
                    DOT_TONE[e.tone ?? 'neutral'],
                  )}
                  aria-hidden
                />
              )}
              {!last && <span className="mt-1 w-px flex-1 bg-divider" aria-hidden />}
            </div>
            <div className={cn('flex min-w-0 flex-1 flex-col gap-1', last ? 'pb-0' : 'pb-5')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-md text-text-primary">{e.title}</span>
                {e.badge}
              </div>
              {e.description && (
                <span className="text-body text-neutral-text">{e.description}</span>
              )}
              {e.meta && <span className="text-body-sm text-text-disabled">{e.meta}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
