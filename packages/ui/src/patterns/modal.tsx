'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Timer, X } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * MES / Modal (Figma 2154:119) — 480 / 560 (por defecto) / **640** (flujos de
 * captura con stepper). Radio 16, `Shadow/Modal`, overlay `rgba(17,24,39,.5)`.
 * Header padding 20/24 (76 de alto) · divider · body 20/24/24 · divider ·
 * footer 16/24 con acciones a la derecha (gap 12).
 */
export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

const WIDTH = { sm: 'max-w-[480px]', md: 'max-w-[560px]', lg: 'max-w-[640px]' } as const;

/** Chip cronómetro TRI del header de los modales de captura (alimenta el KPI TRI). */
export function TimerChip({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border border-border bg-background-subtle px-2.5 py-1',
        'text-caption text-text-secondary tabular',
        className,
      )}
    >
      <Timer className="size-icon-chip shrink-0" aria-hidden />
      {value}
    </span>
  );
}

export interface ModalContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 480 · 560 (por defecto) · 640 para los flujos de captura. */
  size?: keyof typeof WIDTH;
  /** Fila de acciones alineada a la derecha. */
  footer?: React.ReactNode;
  /** Contenido a la izquierda del botón de cierre (p. ej. `<TimerChip value="00:23" />`). */
  headerExtra?: React.ReactNode;
}

export const ModalContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  ModalContentProps
>(function ModalContent(
  { className, title, description, size = 'md', footer, headerExtra, children, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed top-1/2 left-1/2 z-(--z-modal) flex max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
          'rounded-lg bg-background-main shadow-modal outline-none',
          WIDTH[size],
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
          <div className="flex shrink-0 items-center gap-3">
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
