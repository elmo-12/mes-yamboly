'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../utils/cn';

/**
 * MES / Tabs (Figma 2150:51) · Style = Underline | Pills.
 * Underline: fila gap 24, baseline 1 px `divider`, indicador 2 px `primary`,
 * label 14/500 (`text/primary` activo, `text/secondary` inactivo).
 * Pills: gap 8, padding 7/14, radio 999, activo `primary/subtle` + `#1D4ED8`.
 */
export const Tabs = TabsPrimitive.Root;

type TabsStyle = 'underline' | 'pills';

const TabsStyleContext = React.createContext<TabsStyle>('underline');

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsStyle }
>(function TabsList({ className, variant = 'underline', ...props }, ref) {
  return (
    <TabsStyleContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          'relative flex w-full items-center overflow-x-auto',
          variant === 'underline' ? 'gap-6 border-b border-divider' : 'gap-2',
          className,
        )}
        {...props}
      />
    </TabsStyleContext.Provider>
  );
});

export interface TabProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Contador mostrado como "(4)". */
  count?: number;
}

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  TabProps
>(function TabsTrigger({ className, children, count, ...props }, ref) {
  const variant = React.useContext(TabsStyleContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex shrink-0 items-center gap-1 text-body-md whitespace-nowrap outline-none',
        'transition-colors duration-150 ease-standard',
        'disabled:pointer-events-none disabled:text-text-disabled',
        variant === 'underline'
          ? [
              'relative -mb-px h-10 border-b-2 border-transparent px-0.5 pt-3',
              'text-text-secondary hover:text-text-primary',
              'data-[state=active]:border-primary data-[state=active]:text-text-primary',
              'focus-visible:rounded-xs focus-visible:shadow-focus',
            ]
          : [
              'h-8 rounded-pill px-3.5',
              'text-text-secondary hover:bg-background-subtle hover:text-text-primary',
              'data-[state=active]:bg-primary-subtle data-[state=active]:text-info-text',
              'focus-visible:shadow-focus',
            ],
        className,
      )}
      {...props}
    >
      {children}
      {typeof count === 'number' && <span className="tabular">({count})</span>}
    </TabsPrimitive.Trigger>
  );
});

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn('pt-6 outline-none', className)} {...props} />;
});
