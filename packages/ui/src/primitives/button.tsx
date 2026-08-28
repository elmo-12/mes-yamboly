'use client';

import * as React from 'react';
import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * MDS Button v2 (Figma 58:137 · 216 variantes).
 * Hierarchy × Size × State × Icon. Alturas 36/40/48, radio 12, icono 20, spinner 14.
 * Regla MDS: un solo `primary` por pantalla; `danger` siempre con confirmación.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none',
    'transition-colors duration-150 ease-standard',
    'focus-visible:outline-none',
    'disabled:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed focus-visible:shadow-focus disabled:bg-disabled-bg disabled:text-disabled-fg',
        secondary:
          'bg-background-main text-text-primary border border-border hover:bg-background-subtle active:bg-divider focus-visible:border-border-focus focus-visible:shadow-focus disabled:border-divider disabled:text-disabled-fg disabled:bg-background-main',
        danger:
          'bg-error text-error-foreground hover:bg-error-text active:bg-error-text focus-visible:shadow-focus-error disabled:bg-disabled-bg disabled:text-disabled-fg',
        ghost:
          'bg-transparent text-text-secondary hover:bg-background-subtle hover:text-text-primary active:bg-divider focus-visible:shadow-focus disabled:text-disabled-fg',
        link: 'bg-transparent text-primary underline-offset-2 hover:underline focus-visible:shadow-focus disabled:text-disabled-fg h-auto p-0',
      },
      size: {
        sm: 'h-ctrl-sm px-3 text-btn-sm',
        md: 'h-ctrl-md px-4 text-body-md',
        lg: 'h-ctrl-lg px-5 text-btn-lg',
      },
      iconOnly: { true: 'gap-0', false: '' },
      block: { true: 'w-full', false: '' },
    },
    compoundVariants: [
      { iconOnly: true, size: 'sm', class: 'w-ctrl-sm px-2.5' },
      { iconOnly: true, size: 'md', class: 'w-ctrl-md px-2.5' },
      { iconOnly: true, size: 'lg', class: 'w-ctrl-lg px-3.5' },
      { variant: 'link', size: 'sm', class: 'h-auto px-0' },
      { variant: 'link', size: 'md', class: 'h-auto px-0' },
      { variant: 'link', size: 'lg', class: 'h-auto px-0' },
    ],
    defaultVariants: { variant: 'secondary', size: 'md', iconOnly: false, block: false },
  },
);

type ButtonBaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> &
  Omit<VariantProps<typeof buttonVariants>, 'iconOnly'>;

export interface ButtonProps extends ButtonBaseProps {
  /** Renderiza el hijo como elemento raíz (Radix Slot) — p. ej. un `<Link>`. */
  asChild?: boolean;
  /** Icono 20 px. */
  icon?: React.ReactNode;
  /** Posición del icono. `only` requiere `aria-label`. */
  iconPosition?: 'none' | 'leading' | 'trailing' | 'only';
  /** Muestra spinner 14 px y mantiene el label visible (el ancho no salta). */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    icon,
    iconPosition = icon ? 'leading' : 'none',
    loading = false,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const only = iconPosition === 'only';
  const spinner = <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />;
  const small = only && size === 'sm';
  const glyph = icon ? (
    <span
      className={cn(
        'grid shrink-0 place-items-center',
        small ? 'size-icon-sm [&_svg]:size-icon-sm' : 'size-icon-md [&_svg]:size-icon-md',
      )}
      aria-hidden
    >
      {icon}
    </span>
  ) : null;

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block, iconOnly: only }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={asChild && (disabled || loading) ? true : undefined}
      data-loading={loading ? '' : undefined}
      {...props}
    >
      {loading ? spinner : iconPosition === 'leading' || only ? glyph : null}
      {!only && <Slottable>{children}</Slottable>}
      {!loading && iconPosition === 'trailing' ? glyph : null}
    </Comp>
  );
});
