'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

/**
 * MDS Input field (Figma 62:290). Alturas sm 36 / md 40 / lg 48, radio 8,
 * padding-x 12, icono leading 16 a 12 px del borde (texto a 36).
 */
const fieldVariants = cva(
  [
    'flex w-full items-center gap-2 rounded-md border bg-background-main px-3',
    'transition-colors duration-150 ease-standard',
  ],
  {
    variants: {
      size: {
        sm: 'h-ctrl-sm text-body-sm',
        md: 'h-ctrl-md text-body',
        lg: 'h-ctrl-lg px-3.5 text-[15px] leading-5',
      },
      destructive: {
        true: 'border-error focus-within:border-error focus-within:shadow-focus-error',
        false: 'border-border focus-within:border-border-focus focus-within:shadow-focus',
      },
      disabled: {
        true: 'pointer-events-none border-border bg-background-subtle text-text-disabled',
        false: '',
      },
    },
    defaultVariants: { size: 'md', destructive: false, disabled: false },
  },
);

export interface FieldShellProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  destructive?: boolean;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/** Envoltorio label + control + hint, compartido por Input, Textarea y Select. */
export function FieldShell({
  label,
  hint,
  destructive = false,
  required,
  htmlFor,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] leading-4 font-medium text-neutral-text">
          {label}
          {required && <span className="text-error"> *</span>}
        </label>
      )}
      {children}
      {hint && (
        <p className={cn('text-body-sm', destructive ? 'text-error-text' : 'text-text-secondary')}>
          {hint}
        </p>
      )}
    </div>
  );
}

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>,
    Pick<VariantProps<typeof fieldVariants>, 'size'> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  destructive?: boolean;
  /** Icono 16 px a la izquierda. */
  leadingIcon?: React.ReactNode;
  /** Texto prefijo dentro del campo (p. ej. `https://`). */
  prefix?: React.ReactNode;
  /** Sufijo dentro del campo (p. ej. `u/min`). */
  suffix?: React.ReactNode;
  wrapperClassName?: string;
}

const ICON = 'grid size-icon-sm shrink-0 place-items-center text-text-disabled [&_svg]:size-icon-sm';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    wrapperClassName,
    size = 'md',
    label,
    hint,
    destructive = false,
    leadingIcon,
    prefix,
    suffix,
    disabled,
    id,
    required,
    ...props
  },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell
      label={label}
      hint={hint}
      destructive={destructive}
      required={required}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <div className={cn(fieldVariants({ size, destructive, disabled: !!disabled }), className)}>
        {leadingIcon && <span className={ICON}>{leadingIcon}</span>}
        {prefix && <span className="shrink-0 text-text-secondary">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={destructive || undefined}
          className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-disabled disabled:text-text-disabled"
          {...props}
        />
        {suffix && <span className="shrink-0 text-text-secondary">{suffix}</span>}
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  destructive?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, destructive = false, id, rows = 4, required, ...props },
  ref,
) {
  const autoId = React.useId();
  const areaId = id ?? autoId;
  return (
    <FieldShell
      label={label}
      hint={hint}
      destructive={destructive}
      required={required}
      htmlFor={areaId}
    >
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        required={required}
        aria-invalid={destructive || undefined}
        className={cn(
          'w-full resize-y rounded-md border bg-background-main px-3 py-2.5 text-body text-text-primary',
          'transition-colors duration-150 ease-standard outline-none placeholder:text-text-disabled',
          'disabled:pointer-events-none disabled:bg-background-subtle disabled:text-text-disabled',
          destructive
            ? 'border-error focus:border-error focus:shadow-focus-error'
            : 'border-border focus:border-border-focus focus:shadow-focus',
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
});
