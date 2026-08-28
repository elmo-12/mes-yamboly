'use client';

import * as React from 'react';
import { cn } from '../utils/cn';
import { ProgressBar } from '../primitives/feedback';

export type EmptyStateVariant = 'empty' | 'no-results' | 'error' | 'insufficient';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: EmptyStateVariant;
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Solo para `insufficient`: progreso 0–100. */
  progress?: number;
  progressLabel?: string;
}

const CIRCLE: Record<EmptyStateVariant, string> = {
  empty: 'bg-background-subtle text-text-secondary',
  'no-results': 'bg-background-subtle text-text-secondary',
  error: 'bg-error-subtle text-error-text',
  insufficient: 'bg-warning-subtle text-warning-text',
};

/**
 * MES / Empty state (Figma 2152:118) — 400 de ancho, padding 48/32, gap 16.
 * Círculo 80 radio 999 con icono 40; título 16/600; cuerpo 14/400; Button Secondary md.
 */
export function EmptyState({
  variant = 'empty',
  icon,
  title,
  description,
  action,
  progress,
  progressLabel,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center gap-4 px-8 py-12 text-center', className)}
      {...props}
    >
      <span
        className={cn(
          'grid size-20 shrink-0 place-items-center rounded-pill [&_svg]:size-10',
          CIRCLE[variant],
        )}
      >
        {icon}
      </span>
      <div className="flex max-w-96 flex-col gap-1.5">
        <h3 className="text-h4 text-text-primary">{title}</h3>
        {description && <p className="text-body text-text-secondary">{description}</p>}
      </div>
      {variant === 'insufficient' && typeof progress === 'number' && (
        <div className="flex w-72 flex-col gap-1.5">
          <ProgressBar value={progress} tone="warning" />
          {progressLabel && <span className="text-body-sm text-text-secondary">{progressLabel}</span>}
        </div>
      )}
      {action}
    </div>
  );
}
