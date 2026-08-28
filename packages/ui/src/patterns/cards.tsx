'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Sparkles } from 'lucide-react';
import { cn } from '../utils/cn';
import { Badge, type BadgeColor } from '../primitives/badge';
import { Overline } from '../primitives/feedback';

/* ------------------------------------------------------------------ KPI card */

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  /** Variación con signo, p. ej. "+4,2 pp". */
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  /** `true` si la dirección de la tendencia es buena (merma que baja = favorable). */
  favorable?: boolean;
  /** Texto de contexto, p. ej. "vs turno anterior". */
  context?: string;
  /**
   * ADITIVO (V5, Evidencia 2156:5682) — fila intermedia entre el valor y el
   * delta con la meta del indicador y su Badge de estado:
   * `meta={<><span>Meta ≥ 90 %</span><Badge color="success">Cumple</Badge></>}`.
   */
  meta?: React.ReactNode;
}

/**
 * MES / KPI card (Figma 2150:75) — 267×112, mín. 200. Overline + valor 28/34 + delta.
 * Máx. 4 por fila.
 */
export function KpiCard({
  label,
  value,
  delta,
  trend = 'flat',
  favorable,
  context,
  meta,
  className,
  ...props
}: KpiCardProps) {
  const good = favorable ?? trend === 'up';
  const tone =
    trend === 'flat' ? 'text-text-secondary' : good ? 'text-success-text' : 'text-error-text';
  return (
    <div
      className={cn(
        'flex min-w-kpi-card flex-1 flex-col gap-1.5 rounded-md border border-border bg-background-main p-4',
        className,
      )}
      {...props}
    >
      <Overline>{label}</Overline>
      <p className="text-metric tabular text-text-primary">{value}</p>
      {meta && (
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          {meta}
        </div>
      )}
      {(delta || context) && (
        <div className="flex items-center gap-1.5">
          {trend === 'up' && <ArrowUp className={cn('size-3.5 shrink-0', tone)} aria-hidden />}
          {trend === 'down' && <ArrowDown className={cn('size-3.5 shrink-0', tone)} aria-hidden />}
          {trend === 'flat' && <span className="h-0.5 w-2.5 shrink-0 rounded-xs bg-text-disabled" aria-hidden />}
          {delta && <span className={cn('text-body-sm font-medium tabular', tone)}>{delta}</span>}
          {context && <span className="text-caption text-text-disabled">{context}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Alert card */

export type AlertVariant = 'warning' | 'critical' | 'info';

export interface AlertCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Badge del mismo tono al pie (Advertencia / Crítica / Informativa). */
  badge?: React.ReactNode;
  /** Enlace de acción al pie. */
  actionLabel?: string;
  onAction?: () => void;
}

const ALERT: Record<AlertVariant, { bg: string; bar: string; title: string }> = {
  warning: { bg: 'bg-warning-subtle', bar: 'bg-warning', title: 'text-warning-text' },
  critical: { bg: 'bg-error-subtle', bar: 'bg-error', title: 'text-error-text' },
  info: { bg: 'bg-info-subtle', bar: 'bg-primary', title: 'text-info-text' },
};

/**
 * Alert card (Figma 2151:58) — 280×auto, radio 8, **sin borde ni sombra**.
 * Barra izquierda 3 px (radio 4) a alto completo; contenido pl 12 / pr 14 / py 14, gap 8.
 */
export function AlertCard({
  variant = 'warning',
  title,
  description,
  badge,
  actionLabel,
  onAction,
  className,
  ...props
}: AlertCardProps) {
  const t = ALERT[variant];
  return (
    <div
      role="status"
      className={cn('relative flex min-w-alert-card flex-1 rounded-sm', t.bg, className)}
      {...props}
    >
      <span className={cn('w-[3px] shrink-0 rounded-xs', t.bar)} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-3.5 pr-3.5 pl-3">
        <p className={cn('text-body-md font-semibold', t.title)}>{title}</p>
        {description && (
          <p className="text-body-sm leading-[18px] text-neutral-text">{description}</p>
        )}
        {(badge || actionLabel) && (
          <div className="flex items-center justify-between gap-3 pt-0.5">
            {badge ?? <span />}
            {actionLabel && (
              <button
                type="button"
                onClick={onAction}
                className="text-body-sm font-medium text-primary hover:underline"
              >
                {actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Insight card */

export interface InsightCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  text: React.ReactNode;
  /** Confianza del modelo, p. ej. "Confianza 82 %". */
  confidence?: string;
  confidenceColor?: BadgeColor;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Insight card (Figma 2151:59) — 280 px, blanco, borde 1 px, radio 12, padding 16, gap 10.
 * Icon box 32×32 radio 8 sobre `primary/subtle` con icono 20.
 */
export function InsightCard({
  title,
  text,
  confidence,
  confidenceColor = 'informational',
  actionLabel,
  onAction,
  className,
  ...props
}: InsightCardProps) {
  return (
    <div
      className={cn(
        'flex min-w-alert-card flex-1 flex-col gap-2.5 rounded-md border border-border bg-background-main p-4',
        className,
      )}
      {...props}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary-subtle text-primary">
        <Sparkles className="size-icon-md" aria-hidden />
      </span>
      {title && <p className="text-body-md font-semibold text-text-primary">{title}</p>}
      <p className="text-body-sm leading-[18px] text-text-secondary">{text}</p>
      {(confidence || actionLabel) && (
        <div className="flex items-center justify-between gap-3">
          {confidence ? <Badge color={confidenceColor}>{confidence}</Badge> : <span />}
          {actionLabel && (
            <button
              type="button"
              onClick={onAction}
              className="text-body-sm font-medium text-primary hover:underline"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Summary card */

export interface SummaryCardProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  label: string;
  value: React.ReactNode;
  /** Filtro aplicado: borde 1,5 px primary y label en primary. */
  active?: boolean;
}

/**
 * Summary card / filtro (instancia MDS en Órdenes y Alertas) — 267×80, radio 12,
 * padding 16, gap 6. Es un botón: un clic aplica el filtro. Solo una activa.
 */
export function SummaryCard({ label, value, active = false, className, ...props }: SummaryCardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'flex min-w-summary-card flex-1 flex-col items-start gap-1.5 rounded-md bg-background-main p-4 text-left',
        'transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:shadow-focus',
        active
          ? 'border-[1.5px] border-primary'
          : 'border border-border hover:border-border-strong hover:bg-background-subtle',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'text-[12.5px] leading-4 font-medium',
          active ? 'text-primary' : 'text-text-secondary',
        )}
      >
        {label}
      </span>
      <span className="text-[22px] leading-7 font-semibold tabular text-text-primary">{value}</span>
    </button>
  );
}
