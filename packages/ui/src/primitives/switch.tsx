'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../utils/cn';

/** MDS Toggle (Figma 62:603). sm 32×16 · md 40×20, pill; on = primary. */
export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  size?: 'sm' | 'md';
  label?: React.ReactNode;
  supporting?: React.ReactNode;
}

const TRACK = { sm: 'h-4 w-8', md: 'h-5 w-10' } as const;
const THUMB = {
  sm: 'size-3 data-[state=checked]:translate-x-4',
  md: 'size-4 data-[state=checked]:translate-x-5',
} as const;

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch({ className, size = 'md', label, supporting, id, ...props }, ref) {
  const autoId = React.useId();
  const switchId = id ?? autoId;
  const control = (
    <SwitchPrimitive.Root
      ref={ref}
      id={switchId}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-pill p-0.5 outline-none',
        'transition-colors duration-150 ease-standard',
        'bg-border data-[state=checked]:bg-primary',
        'focus-visible:shadow-focus',
        'disabled:pointer-events-none disabled:bg-divider disabled:data-[state=checked]:bg-primary-subtle-border',
        TRACK[size],
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block rounded-pill bg-background-main shadow-thumb transition-transform duration-150 ease-standard',
          'translate-x-0',
          THUMB[size],
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;

  return (
    <div className="flex items-start gap-3">
      {control}
      <div className="flex flex-col gap-0.5">
        <label htmlFor={switchId} className="cursor-pointer text-body-md text-text-primary">
          {label}
        </label>
        {supporting && <span className="text-body-sm text-text-secondary">{supporting}</span>}
      </div>
    </div>
  );
});
