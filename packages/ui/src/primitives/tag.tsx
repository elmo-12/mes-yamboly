'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * MDS Tag (Figma 60:92). Elemento **interactivo** (el Badge nunca lo es).
 * sm 24 · md 28 · lg 32, radio 8. Selected usa color de marca, no semántico.
 */
export const tagVariants = cva(
  [
    'inline-flex items-center rounded-sm border font-medium whitespace-nowrap',
    'transition-colors duration-150 ease-standard focus-visible:outline-none',
    'disabled:pointer-events-none disabled:border-divider disabled:text-text-disabled',
  ],
  {
    variants: {
      size: {
        sm: 'h-6 gap-[5px] px-2 text-body-sm',
        /* Tag de filtro (28): 12/500 según MDS 60:92 — antes 13 px. */
        md: 'h-7 gap-[5px] px-2.5 text-[12px] leading-4',
        lg: 'h-8 gap-[5px] px-3 text-body',
      },
      selected: {
        true: 'border-primary-subtle-border bg-primary-subtle text-info-text hover:bg-primary-subtle',
        false:
          'border-border bg-background-main text-neutral-text hover:border-border-strong hover:bg-background-subtle active:bg-divider',
      },
    },
    defaultVariants: { size: 'sm', selected: false },
  },
);

export interface TagProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>,
    VariantProps<typeof tagVariants> {
  /** Contador a la derecha (tope 99+). */
  count?: number;
  /** Muestra la X de cierre y expone `onRemove`. */
  removable?: boolean;
  onRemove?: () => void;
}

const X_SIZE = { sm: 'size-3', md: 'size-3.5', lg: 'size-4' } as const;
const PAD_R = { sm: 'pr-1.5', md: 'pr-2', lg: 'pr-2.5' } as const;
const COUNT_TEXT = { sm: 'text-[10px]', md: 'text-[11px]', lg: 'text-body-sm' } as const;

export const Tag = React.forwardRef<HTMLButtonElement, TagProps>(function Tag(
  { className, size = 'sm', selected = false, count, removable, onRemove, children, ...props },
  ref,
) {
  const s = size ?? 'sm';
  const hasTrailing = removable || typeof count === 'number';
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected ?? false}
      className={cn(
        tagVariants({ size, selected }),
        hasTrailing && PAD_R[s],
        'focus-visible:border-border-focus focus-visible:shadow-focus',
        className,
      )}
      {...props}
    >
      <span className="truncate" style={{ maxWidth: 200 }}>
        {children}
      </span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'rounded-pill px-[5px] py-px font-medium',
            COUNT_TEXT[s],
            selected ? 'bg-primary-subtle-fill text-info-text' : 'bg-divider text-neutral-text',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
      {removable && (
        <span
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="inline-flex cursor-pointer items-center"
        >
          <X className={cn(X_SIZE[s], 'shrink-0')} aria-hidden />
        </span>
      )}
    </button>
  );
});
