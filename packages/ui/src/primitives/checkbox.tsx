'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../utils/cn';

/** MDS Checkbox (Figma 85:530). sm 16 · md 20, radio 4. Con label y texto de apoyo opcionales. */
export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'children'> {
  size?: 'sm' | 'md';
  label?: React.ReactNode;
  supporting?: React.ReactNode;
}

const BOX = { sm: 'size-4 rounded-xs', md: 'size-5 rounded-chip' } as const;

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox({ className, size = 'md', label, supporting, id, ...props }, ref) {
  const autoId = React.useId();
  const boxId = id ?? autoId;
  const box = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={boxId}
      className={cn(
        'peer grid shrink-0 place-items-center border border-border-strong bg-background-main',
        'transition-colors duration-150 ease-standard outline-none',
        'hover:border-primary focus-visible:border-border-focus focus-visible:shadow-focus',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        'disabled:pointer-events-none disabled:border-border disabled:bg-disabled-bg',
        'disabled:data-[state=checked]:border-primary-subtle-border disabled:data-[state=checked]:bg-primary-subtle-border',
        BOX[size],
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center text-current">
        {props.checked === 'indeterminate' ? (
          <Minus className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={3} aria-hidden />
        ) : (
          <Check className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return box;

  return (
    <div className="flex items-start gap-2.5">
      <span className="pt-px">{box}</span>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={boxId} className="cursor-pointer text-body-md text-text-primary">
          {label}
        </label>
        {supporting && <span className="text-body-sm text-text-secondary">{supporting}</span>}
      </div>
    </div>
  );
});
