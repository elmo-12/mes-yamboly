'use client';

import * as React from 'react';
import { Toaster as SonnerToaster, toast } from 'sonner';

export { toast };

/** Toaster con estética MDS: borde 1 px, radio 12, Shadow/Dropdown, icono semántico. */
export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      position="bottom-right"
      gap={12}
      /* 3 s: el toast se apoya en la esquina inferior derecha, justo donde cae
       * el menú de acciones de la última fila de las tablas; más tiempo lo
       * tapa. */
      duration={3000}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-md !border !border-border !bg-background-main !shadow-dropdown !text-body !text-text-primary !font-sans !gap-2.5 !p-4',
          title: '!text-body-md !text-text-primary',
          description: '!text-body-sm !text-text-secondary',
          actionButton:
            '!rounded-md !bg-primary !text-primary-foreground !text-body-sm !font-medium !h-9 !px-3',
          cancelButton:
            '!rounded-md !bg-background-main !border !border-border !text-text-primary !text-body-sm !font-medium !h-9 !px-3',
          success: '[&_[data-icon]]:!text-success',
          warning: '[&_[data-icon]]:!text-warning',
          error: '[&_[data-icon]]:!text-error',
          info: '[&_[data-icon]]:!text-primary',
        },
      }}
      {...props}
    />
  );
}
