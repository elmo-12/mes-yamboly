'use client';

import * as React from 'react';
import { Activity, AlertTriangle, Ellipsis, PlayCircle, StopCircle } from 'lucide-react';
import { cn } from '../utils/cn';
import { Badge, type BadgeColor } from '../primitives/badge';
import { Button } from '../primitives/button';

/** Estados operativos de una línea de producción. */
export type LineState = 'produciendo' | 'parada' | 'sin-orden' | 'alerta' | 'sugerida';

export type SegmentTone = 'ok' | 'micro' | 'stop' | 'idle' | 'unknown';

export interface LineSegment {
  tone: SegmentTone;
  /** Peso relativo del segmento (por defecto 1). */
  weight?: number;
}

export interface LineMetric {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}

const SEGMENT_BG: Record<SegmentTone, string> = {
  ok: 'bg-success',
  micro: 'bg-warning',
  stop: 'bg-error',
  idle: 'bg-border',
  unknown: 'bg-text-disabled',
};

const STATE_META: Record<LineState, { badge: BadgeColor; label: string }> = {
  produciendo: { badge: 'success', label: 'Produciendo' },
  parada: { badge: 'critical', label: 'En parada' },
  'sin-orden': { badge: 'neutral', label: 'Sin orden' },
  alerta: { badge: 'warning', label: 'Riesgo de parada' },
  sugerida: { badge: 'warning', label: 'Parada detectada por sensor' },
};

export interface LineCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** "L1 · Paletas" */
  line: string;
  /** "OF-2026-0812 · Paleta Chocolate 80 ml" */
  order?: string;
  state: LineState;
  /** Sustituye el texto del badge de estado. */
  badgeLabel?: string;
  /** Tres métricas: PRODUCIDO · VELOCIDAD · TURNO. */
  metrics?: readonly LineMetric[];
  /** Segmentos del timeline de 8 px. */
  segments?: readonly LineSegment[];
  /** Mensaje del chip para `alerta` (ámbar) y `sugerida` (azul). */
  message?: string;
  /** Sustituye la botonera por completo. */
  actions?: React.ReactNode;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onMore?: () => void;
}

/**
 * MES / Line card (Figma 2153:238) — 356 px, radio 12, padding 16, gap 12.
 * `parada` lleva borde 1,5 px `error`. Botonera táctil `lg` (48) salvo `sugerida` (`sm` 36).
 * Excepción MDS: esta tarjeta puede llevar su propio Button `primary` en Tiempo real.
 */
export function LineCard({
  line,
  order,
  state,
  badgeLabel,
  metrics = [],
  segments = [],
  message,
  actions,
  onPrimaryAction,
  onSecondaryAction,
  onMore,
  className,
  ...props
}: LineCardProps) {
  const meta = STATE_META[state];
  const isSuggested = state === 'sugerida';
  const isAlert = state === 'alerta';

  const defaultActions = (() => {
    if (actions) return actions;
    if (isSuggested) {
      return (
        <>
          <Button variant="primary" size="sm" block onClick={onPrimaryAction}>
            Confirmar parada
          </Button>
          <Button variant="secondary" size="sm" block onClick={onSecondaryAction}>
            Descartar
          </Button>
        </>
      );
    }
    if (state === 'sin-orden') {
      return (
        <>
          <Button
            variant="primary"
            size="lg"
            block
            icon={<PlayCircle />}
            onClick={onPrimaryAction}
          >
            Iniciar orden
          </Button>
          <Button
            variant="secondary"
            size="lg"
            icon={<Ellipsis />}
            iconPosition="only"
            aria-label="Más acciones"
            onClick={onMore}
          />
        </>
      );
    }
    return (
      <>
        <Button variant="primary" size="lg" block icon={<StopCircle />} onClick={onPrimaryAction}>
          Parada
        </Button>
        <Button variant="secondary" size="lg" block onClick={onSecondaryAction}>
          Merma
        </Button>
        <Button
          variant="secondary"
          size="lg"
          icon={<Ellipsis />}
          iconPosition="only"
          aria-label="Más acciones"
          onClick={onMore}
        />
      </>
    );
  })();

  return (
    <div
      className={cn(
        /* 356 es el ancho de la tarjeta en Figma, pero como máximo: dentro de
           una rejilla más estrecha (1280 con sidebar) debe encoger en vez de
           desbordar la página. */
        'flex w-full max-w-line-card flex-col gap-3 rounded-md bg-background-main p-4',
        state === 'parada' ? 'border-[1.5px] border-error' : 'border border-border',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-h4 text-text-primary">{line}</p>
        <Badge color={meta.badge}>{badgeLabel ?? meta.label}</Badge>
      </div>

      {order && <p className="text-body-sm leading-[18px] text-text-secondary">{order}</p>}

      {metrics.length > 0 && (
        <div className="flex gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-overline text-text-disabled uppercase">{m.label}</span>
              <span className="truncate text-body-md font-semibold tabular text-text-primary">
                {m.value}
              </span>
              {m.note && <span className="truncate text-caption font-normal text-text-disabled">{m.note}</span>}
            </div>
          ))}
        </div>
      )}

      {segments.length > 0 && (
        <div className="flex h-2 w-full overflow-hidden rounded-xs bg-divider" aria-hidden>
          {segments.map((s, i) => (
            <div
              key={i}
              className={cn('h-full min-w-px', SEGMENT_BG[s.tone])}
              style={{ flex: `${s.weight ?? 1} 0 0` }}
            />
          ))}
        </div>
      )}

      {message && (isAlert || isSuggested) && (
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-chip py-1.5 pr-2.5 pl-2',
            isSuggested ? 'bg-primary-subtle' : 'bg-warning-subtle',
          )}
        >
          {isSuggested ? (
            <Activity className="size-icon-chip shrink-0 text-info-text" aria-hidden />
          ) : (
            <AlertTriangle className="size-icon-chip shrink-0 text-warning-text" aria-hidden />
          )}
          <p
            className={cn(
              'text-caption leading-[15px] font-medium',
              isSuggested ? 'text-info-text' : 'text-warning-text',
            )}
          >
            {message}
          </p>
        </div>
      )}

      <div className="flex items-stretch gap-2">{defaultActions}</div>
    </div>
  );
}
