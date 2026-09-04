'use client';

import * as React from 'react';
import { Activity, AlertTriangle, Ellipsis, PlayCircle, StopCircle } from 'lucide-react';
import { cn } from '../utils/cn';
import { Badge, type BadgeColor } from '../primitives/badge';
import { Button } from '../primitives/button';
import { ProgressBar, type ProgressBarProps } from '../primitives/feedback';

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

/** Tono del chip contextual; por defecto se deduce del estado de la línea. */
export type LineMessageTone = 'info' | 'warning' | 'critical';

export interface LineProgress {
  /** 0–100. */
  value: number;
  /** Etiqueta a la izquierda ("Avance del objetivo del turno"). */
  label?: React.ReactNode;
  /** Cifra a la derecha ("68 % · 165 400 / 242 000 u"). */
  valueLabel?: React.ReactNode;
  tone?: ProgressBarProps['tone'];
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

/** Tono por defecto del chip contextual según el estado. */
const MESSAGE_TONE: Partial<Record<LineState, LineMessageTone>> = {
  parada: 'critical',
  alerta: 'warning',
  sugerida: 'info',
};

const MESSAGE_STYLE: Record<LineMessageTone, { box: string; text: string; icon: string }> = {
  info: { box: 'bg-primary-subtle', text: 'text-info-text', icon: 'text-info-text' },
  warning: { box: 'bg-warning-subtle', text: 'text-warning-text', icon: 'text-warning-text' },
  critical: { box: 'bg-error-subtle', text: 'text-error-text', icon: 'text-error-text' },
};

const MESSAGE_ICON: Record<LineMessageTone, React.ComponentType<{ className?: string }>> = {
  info: Activity,
  warning: AlertTriangle,
  critical: StopCircle,
};

export interface LineCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /**
   * Nombre de la línea. En `compact` es la cabecera completa ("L1 · Paletas");
   * en `expanded` es el nombre largo y el código va en `code`.
   */
  line: string;
  /** Código de la línea ("EXTR-2") — chip a la izquierda del nombre. */
  code?: string;
  /** "OF-2026-0812 · Paleta Chocolate 80 ml" */
  order?: string;
  /** Segunda línea de contexto de la orden (turno, lote, maquinista). */
  meta?: React.ReactNode;
  state: LineState;
  /** Sustituye el texto del badge de estado. */
  badgeLabel?: string;
  /**
   * Métricas del turno: 3 en `compact` (PRODUCIDO · VELOCIDAD · TURNO) y 4 en
   * `expanded` (2×2 en tarjeta estrecha, 1×4 a partir de 672 px de contenido).
   */
  metrics?: readonly LineMetric[];
  /** Segmentos del timeline de 8 px. */
  segments?: readonly LineSegment[];
  /** Barra de progreso con etiqueta (alternativa al timeline en `expanded`). */
  progress?: LineProgress;
  /** Mensaje del chip contextual (parada abierta, detección IoT, riesgo IA). */
  message?: string;
  /** Fuerza el tono del chip; por defecto lo decide el estado. */
  messageTone?: LineMessageTone;
  /** Sustituye la botonera por completo. */
  actions?: React.ReactNode;
  /**
   * `compact` (356 px, Figma 2153:238) o `expanded` — tarjeta ancha del tablero
   * de Tiempo real: cabecera sin truncar, 4 métricas y barra de progreso.
   */
  layout?: 'compact' | 'expanded';
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onMore?: () => void;
}

/**
 * MES / Line card (Figma 2153:238) — 356 px, radio 12, padding 16, gap 12.
 * `parada` lleva borde 1,5 px `error`. Botonera táctil `lg` (48) salvo `sugerida` (`sm` 36).
 * Excepción MDS: esta tarjeta puede llevar su propio Button `primary` en Tiempo real.
 *
 * `layout="expanded"` es la variante del tablero de Tiempo real: sin tope de
 * ancho, padding 20, gap 20, cabecera código + nombre completo sin truncar,
 * rejilla de métricas que pasa de 2×2 a 1×4 por consulta de contenedor y barra
 * de progreso etiquetada en lugar del timeline de segmentos.
 */
export function LineCard({
  line,
  code,
  order,
  meta,
  state,
  badgeLabel,
  metrics = [],
  segments = [],
  progress,
  message,
  messageTone,
  actions,
  layout = 'compact',
  onPrimaryAction,
  onSecondaryAction,
  onMore,
  className,
  ...props
}: LineCardProps) {
  const estadoMeta = STATE_META[state];
  const isSuggested = state === 'sugerida';
  const expanded = layout === 'expanded';
  const tone = messageTone ?? MESSAGE_TONE[state];

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
           desbordar la página. La variante `expanded` reparte el ancho de la
           rejilla y por eso no lleva tope. */
        'flex w-full flex-col rounded-md bg-background-main',
        expanded ? '@container/line-card gap-5 p-5' : 'max-w-line-card gap-3 p-4',
        state === 'parada' ? 'border-[1.5px] border-error' : 'border border-border',
        className,
      )}
      {...props}
    >
      <div className={cn('flex justify-between gap-3', expanded ? 'items-start' : 'items-center')}>
        <div className={cn('flex min-w-0 flex-1 items-center gap-2', expanded && 'flex-wrap')}>
          {code && (
            <span className="shrink-0 rounded-chip bg-background-subtle px-2 py-0.5 text-caption font-semibold tabular text-text-secondary">
              {code}
            </span>
          )}
          <p className={cn('text-h4 text-text-primary', expanded ? 'min-w-0' : 'truncate')}>
            {line}
          </p>
        </div>
        <div className="shrink-0">
          <Badge color={estadoMeta.badge}>{badgeLabel ?? estadoMeta.label}</Badge>
        </div>
      </div>

      {(order || meta) && (
        <div className={cn('flex min-w-0 flex-col', expanded ? 'gap-1' : 'gap-0.5')}>
          {order && (
            <p
              className={cn(
                'text-text-secondary',
                expanded ? 'text-body-md text-text-primary' : 'text-body-sm leading-[18px]',
              )}
            >
              {order}
            </p>
          )}
          {meta && <p className="text-caption text-text-disabled">{meta}</p>}
        </div>
      )}

      {metrics.length > 0 && (
        <div
          className={cn(
            /* 2×2 mientras la tarjeta comparte fila (dos columnas a partir de
               1280); 1×4 solo cuando ocupa el ancho completo y las notas
               ("objetivo 255,0 · −3 %") caben sin truncarse. */
            expanded
              ? 'grid grid-cols-2 gap-x-5 gap-y-4 @2xl/line-card:grid-cols-4'
              : 'flex gap-3',
          )}
        >
          {metrics.map((m) => (
            <div
              key={m.label}
              className={cn('flex min-w-0 flex-col', expanded ? 'gap-1' : 'flex-1 gap-[3px]')}
            >
              <span className="truncate text-overline text-text-disabled uppercase">{m.label}</span>
              <span
                className={cn(
                  'truncate font-semibold tabular text-text-primary',
                  expanded ? 'text-h4' : 'text-body-md',
                )}
              >
                {m.value}
              </span>
              {m.note && (
                <span className="truncate text-caption font-normal text-text-disabled">
                  {m.note}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {progress && (
        <div className="flex flex-col gap-1.5">
          {(progress.label || progress.valueLabel) && (
            <div className="flex items-baseline justify-between gap-3">
              {progress.label && (
                <span className="min-w-0 truncate text-caption text-text-secondary">
                  {progress.label}
                </span>
              )}
              {progress.valueLabel && (
                <span className="shrink-0 text-caption font-semibold tabular text-text-primary">
                  {progress.valueLabel}
                </span>
              )}
            </div>
          )}
          <ProgressBar
            value={progress.value}
            tone={progress.tone ?? 'primary'}
            height={8}
            label={typeof progress.label === 'string' ? progress.label : undefined}
          />
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

      {message && tone && <MensajeLinea tone={tone} expanded={expanded} texto={message} />}

      {/* `expanded` deja envolver la botonera: en una tarjeta estrecha (móvil)
          el Primary ocupa la fila entera y la secundaria comparte la siguiente
          con el menú, en lugar de desbordar la página. */}
      <div
        className={cn(
          'flex items-stretch gap-2',
          expanded && 'mt-auto flex-wrap pt-1 [&>button]:min-w-0',
        )}
      >
        {defaultActions}
      </div>
    </div>
  );
}

/** Chip contextual: parada abierta (error), riesgo IA (warning), IoT (info). */
function MensajeLinea({
  tone,
  expanded,
  texto,
}: {
  tone: LineMessageTone;
  expanded: boolean;
  texto: string;
}) {
  const estilo = MESSAGE_STYLE[tone];
  const IconoMensaje = MESSAGE_ICON[tone];
  return (
    <div
      className={cn(
        'flex items-start gap-1.5 rounded-chip',
        expanded ? 'px-3 py-2' : 'py-1.5 pr-2.5 pl-2',
        estilo.box,
      )}
    >
      <IconoMensaje className={cn('size-icon-chip mt-px shrink-0', estilo.icon)} aria-hidden />
      <p
        className={cn(
          'min-w-0 font-medium',
          expanded ? 'text-body-sm' : 'text-caption leading-[15px]',
          estilo.text,
        )}
      >
        {texto}
      </p>
    </div>
  );
}
