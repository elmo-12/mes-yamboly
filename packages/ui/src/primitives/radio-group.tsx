'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { cn } from '../utils/cn';

/** MDS Radio (Figma 85:530, Type=Radio). sm 16 · md 20. */
export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Root ref={ref} className={cn('flex flex-col gap-3', className)} {...props} />
  );
});

const DOT = { sm: 'size-4', md: 'size-5' } as const;

export interface RadioProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  size?: 'sm' | 'md';
  label?: React.ReactNode;
  supporting?: React.ReactNode;
}

export const Radio = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  RadioProps
>(function Radio({ className, size = 'md', label, supporting, id, ...props }, ref) {
  const autoId = React.useId();
  const radioId = id ?? autoId;
  const control = (
    <RadioGroupPrimitive.Item
      ref={ref}
      id={radioId}
      className={cn(
        'grid shrink-0 place-items-center rounded-pill border border-border-strong bg-background-main',
        'transition-colors duration-150 ease-standard outline-none',
        'hover:border-primary focus-visible:border-border-focus focus-visible:shadow-focus',
        'data-[state=checked]:border-primary',
        'disabled:pointer-events-none disabled:border-border disabled:bg-disabled-bg',
        DOT[size],
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator asChild>
        <span
          className={cn('rounded-pill bg-primary', size === 'sm' ? 'size-2' : 'size-2.5')}
          aria-hidden
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );

  if (!label) return control;

  return (
    <div className="flex items-start gap-2.5">
      <span className="pt-px">{control}</span>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={radioId} className="cursor-pointer text-body-md text-text-primary">
          {label}
        </label>
        {supporting && <span className="text-body-sm text-text-secondary">{supporting}</span>}
      </div>
    </div>
  );
});
