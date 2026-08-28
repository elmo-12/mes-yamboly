'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../utils/cn';

/** MDS Tooltip (Figma 86:88). Theme Dark (por defecto) | Light, con texto de apoyo opcional. */
export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export interface TooltipProps {
  content: React.ReactNode;
  supporting?: React.ReactNode;
  theme?: 'dark' | 'light';
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: React.ReactNode;
  delayDuration?: number;
}

export function Tooltip({
  content,
  supporting,
  theme = 'dark',
  side = 'top',
  delayDuration = 200,
  children,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-(--z-tooltip) max-w-64 rounded-sm px-3 py-2 shadow-dropdown',
            theme === 'dark'
              ? 'bg-text-primary text-text-inverse'
              : 'border border-border bg-background-main text-text-primary',
          )}
        >
          <p className="text-body-sm font-medium">{content}</p>
          {supporting && (
            <p className={cn('mt-1 text-caption', theme === 'dark' ? 'opacity-80' : 'text-text-secondary')}>
              {supporting}
            </p>
          )}
          <TooltipPrimitive.Arrow
            className={theme === 'dark' ? 'fill-text-primary' : 'fill-background-main'}
            width={10}
            height={5}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
