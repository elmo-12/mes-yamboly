'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

/**
 * MDS Badge (Figma 53:32 · 12 variantes = Color(6) × Dot(2)).
 * Geometría: padding 3/10, pill, 12px/500, alto 21, punto 6 con gap 6.
 * Regla dura: **nunca es interactivo**. Si es clicable o eliminable → `Tag`.
 */
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-badge whitespace-nowrap',
  {
    variants: {
      color: {
        neutral: 'bg-neutral-subtle text-neutral-text',
        informational: 'bg-info-subtle text-info-text',
        success: 'bg-success-subtle text-success-text',
        warning: 'bg-warning-subtle text-warning-text',
        critical: 'bg-error-subtle text-error-text',
        accent: 'bg-accent-subtle text-accent-text',
      },
    },
    defaultVariants: { color: 'neutral' },
  },
);

export type BadgeColor = NonNullable<VariantProps<typeof badgeVariants>['color']>;

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof badgeVariants> {
  /** Punto 6 px de refuerzo. Nunca sustituye al texto. */
  dot?: boolean;
}

export function Badge({ className, color, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ color }), className)} {...props}>
      {dot && <span className="size-1.5 shrink-0 rounded-pill bg-current" aria-hidden />}
      {children}
    </span>
  );
}
