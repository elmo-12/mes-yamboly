'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';
import { FieldShell } from './input';

/** Dropdown field MDS (Figma 441:2093): trigger 40, borde, chevron; menú con Shadow/Dropdown, ítems 36. */
export const SelectRoot = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

const TRIGGER_SIZE = { sm: 'h-ctrl-sm text-body-sm', md: 'h-ctrl-md text-body', lg: 'h-ctrl-lg text-body' } as const;

export const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    size?: keyof typeof TRIGGER_SIZE;
    destructive?: boolean;
  }
>(function SelectTrigger({ className, size = 'md', destructive = false, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md border bg-background-main px-3',
        'text-text-primary transition-colors duration-150 ease-standard outline-none',
        'data-[placeholder]:text-text-disabled',
        'disabled:pointer-events-none disabled:bg-background-subtle disabled:text-text-disabled',
        TRIGGER_SIZE[size],
        destructive
          ? 'border-error focus:border-error focus:shadow-focus-error'
          : 'border-border focus:border-border-focus focus:shadow-focus data-[state=open]:border-border-focus',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-icon-sm shrink-0 text-text-secondary" aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = 'popper', ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={4}
        className={cn(
          'z-(--z-dropdown) min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md',
          'border border-border bg-background-main p-1 shadow-dropdown',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-72">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2.5 text-body text-text-primary outline-none',
        'data-[highlighted]:bg-background-subtle data-[state=checked]:bg-primary-subtle data-[state=checked]:text-info-text',
        'data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ml-auto">
        <Check className="size-icon-sm" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});

export const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator ref={ref} className={cn('my-1 h-px bg-divider', className)} {...props} />
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  destructive?: boolean;
  placeholder?: string;
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: keyof typeof TRIGGER_SIZE;
  disabled?: boolean;
  className?: string;
}

/** Select completo (label + trigger + menú) para formularios. */
export function Select({
  label,
  hint,
  destructive = false,
  placeholder = 'Selecciona…',
  options,
  size = 'md',
  className,
  ...props
}: SelectProps) {
  return (
    <FieldShell label={label} hint={hint} destructive={destructive} className={className}>
      <SelectRoot {...props}>
        <SelectTrigger size={size} destructive={destructive}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </FieldShell>
  );
}

/* ------------------------------------------------------------------ */
/* Dropdown inline (MDS 442:58) — aditivo V2                           */
/* ------------------------------------------------------------------ */

export interface SelectInlineProps extends Omit<SelectProps, 'hint' | 'destructive' | 'size'> {
  /** Etiqueta a la izquierda del valor ("Turno", "Periodo"). */
  label?: string;
}

/**
 * Dropdown inline del MDS (442:58): sin borde, `padding 6/8`, radio 8, gap 6;
 * label 14/400 `text/secondary` + valor 14/500 `text/primary` + chevron 16.
 * Se usa en barras de herramientas (selector de turno/periodo), nunca en formularios.
 */
export function SelectInline({
  label,
  placeholder = 'Selecciona…',
  options,
  className,
  disabled,
  ...props
}: SelectInlineProps) {
  const actual = options.find((o) => o.value === props.value);
  return (
    <SelectRoot disabled={disabled} {...props}>
      <SelectPrimitive.Trigger
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 outline-none',
          'transition-colors duration-150 ease-standard hover:bg-background-subtle',
          'focus-visible:shadow-focus disabled:pointer-events-none disabled:text-text-disabled',
          className,
        )}
      >
        {label && <span className="text-body text-text-secondary">{label}</span>}
        <span className="text-body-md text-text-primary">{actual?.label ?? placeholder}</span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-icon-sm shrink-0 text-text-secondary" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}
