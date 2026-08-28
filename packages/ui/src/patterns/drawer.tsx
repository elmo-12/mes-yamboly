'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

/** Drawer lateral derecho 480 px (Radix Dialog) con Shadow/Drawer. */
export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export interface DrawerContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** Lado de anclaje. `right` (por defecto) para detalle; `left` para navegación. */
  side?: 'left' | 'right';
  /**
   * Oculta visualmente la cabecera (el título se mantiene para lectores de
   * pantalla). Se usa cuando el contenido trae su propia cabecera, como el
   * Sidebar en el drawer de navegación de tablet/móvil.
   */
  hideHeader?: boolean;
}

const SIDE: Record<'left' | 'right', string> = {
  right: 'right-0 shadow-drawer',
  left: 'left-0 shadow-drawer-left',
};

export const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(function DrawerContent(
  {
    className,
    title,
    description,
    footer,
    headerExtra,
    side = 'right',
    hideHeader = false,
    children,
    ...props
  },
  ref,
) {
  if (hideHeader) {
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            'fixed inset-y-0 z-(--z-modal) flex w-drawer max-w-[92vw] flex-col',
            'bg-background-main outline-none',
            SIDE[side],
            className,
          )}
          {...props}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="sr-only">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed inset-y-0 z-(--z-modal) flex w-drawer max-w-[92vw] flex-col',
          'bg-background-main outline-none',
          SIDE[side],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-divider px-6 py-5">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogPrimitive.Title className="text-h3 text-text-primary">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-body-sm text-text-secondary">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="grid size-9 place-items-center rounded-md border border-border text-text-secondary transition-colors hover:bg-background-subtle hover:text-text-primary"
            >
              <X className="size-icon-sm" aria-hidden />
            </DialogPrimitive.Close>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-divider px-6 py-4">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
