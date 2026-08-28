'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../utils/cn';

export type StepStatus = 'pending' | 'current' | 'done';

export interface Step {
  label: string;
  description?: string;
  status?: StepStatus;
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: readonly Step[];
  /** Índice del paso actual (0-based) si no se define `status` por paso. */
  current?: number;
  orientation?: 'horizontal' | 'vertical';
  /**
   * Ancho de cada paso en horizontal. 112 por defecto (captura rápida, 3 pasos);
   * 150 en el `MES / Stepper CRISP-DM` de Analítica (Figma 2163:16124).
   * (aditivo · V4)
   */
  itemWidth?: number;
}

function statusOf(step: Step, index: number, current: number): StepStatus {
  if (step.status) return step.status;
  if (index < current) return 'done';
  if (index === current) return 'current';
  return 'pending';
}

const CIRCLE: Record<StepStatus, string> = {
  done: 'bg-primary text-primary-foreground',
  current: 'bg-primary text-primary-foreground',
  pending: 'border-2 border-border bg-background-main text-text-disabled',
};

const LABEL: Record<StepStatus, string> = {
  done: 'text-text-primary',
  current: 'text-text-primary',
  pending: 'text-text-disabled',
};

/**
 * MES / Stepper (Figma 2152:87). Círculo 28 radio 999, label debajo 12/500,
 * conector 2 px (`border` pendiente, `primary` recorrido). N pasos: 3 en la
 * captura rápida, 6 en el CRISP-DM de Analítica (usar `orientation="vertical"`
 * cuando cada fase lleva descripción).
 */
export function Stepper({
  steps,
  current = 0,
  orientation = 'horizontal',
  itemWidth,
  className,
  ...props
}: StepperProps) {
  if (orientation === 'vertical') {
    return (
      <ol className={cn('flex flex-col', className)} {...props}>
        {steps.map((s, i) => {
          const st = statusOf(s, i, current);
          const last = i === steps.length - 1;
          return (
            <li key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-pill text-body-sm font-semibold',
                    CIRCLE[st],
                  )}
                >
                  {st === 'done' ? (
                    <Check className="size-icon-chip" strokeWidth={3} aria-hidden />
                  ) : (
                    i + 1
                  )}
                </span>
                {!last && (
                  <span
                    className={cn('w-0.5 flex-1', st === 'done' ? 'bg-primary' : 'bg-border')}
                    aria-hidden
                  />
                )}
              </div>
              <div className={cn('flex flex-col gap-1 pt-1', last ? 'pb-0' : 'pb-6')}>
                <span className={cn('text-body-md', LABEL[st])}>{s.label}</span>
                {s.description && (
                  <span className="text-body-sm text-text-secondary">{s.description}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className={cn('flex w-full items-start', className)} {...props}>
      {steps.map((s, i) => {
        const st = statusOf(s, i, current);
        const last = i === steps.length - 1;
        return (
          <React.Fragment key={s.label}>
            <li
              className={cn('flex shrink-0 flex-col items-center gap-2', !itemWidth && 'w-28')}
              style={itemWidth ? { width: itemWidth } : undefined}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-pill text-body-sm font-semibold',
                  CIRCLE[st],
                )}
              >
                {st === 'done' ? <Check className="size-icon-chip" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className={cn('text-center text-body-sm font-medium', LABEL[st])}>{s.label}</span>
              {/* La descripción también se muestra en horizontal (aditivo · V4). */}
              {s.description && (
                <span className="text-center text-body-sm text-text-disabled">{s.description}</span>
              )}
            </li>
            {!last && (
              <span
                className={cn(
                  'mt-3.5 h-0.5 min-w-6 flex-1',
                  st === 'done' ? 'bg-primary' : 'bg-border',
                )}
                aria-hidden
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
