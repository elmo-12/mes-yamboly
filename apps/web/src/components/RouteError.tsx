'use client';

import * as React from 'react';
import { Button, EmptyState, Icon } from '@mes/ui';

export interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Cuerpo compartido de los `error.tsx` del shell (Empty state Kind=Error). */
export function RouteError({ error, reset }: RouteErrorProps) {
  React.useEffect(() => {
    console.error('[MES] error de ruta', error);
  }, [error]);

  return (
    <EmptyState
      variant="error"
      icon={<Icon name="alert-circle" size={40} />}
      title="No se pudo cargar la vista"
      description="Ocurrió un error al preparar esta pantalla. Reintenta; si continúa, avisa al área de sistemas."
      action={
        <Button variant="secondary" onClick={reset} icon={<Icon name="arrow-path" />}>
          Reintentar
        </Button>
      }
    />
  );
}
