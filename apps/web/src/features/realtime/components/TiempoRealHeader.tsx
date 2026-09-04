'use client';

import * as React from 'react';
import { Button, Icon } from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { formatNumber } from '@mes/shared';

export interface TiempoRealHeaderProps {
  /** ISO-8601 de la última respuesta del backend. */
  actualizadoEn?: string;
  turnoLabel?: string;
  turnoRango?: string;
  /** Regla MDS: el Primary de la pantalla base se deshabilita con overlay abierto. */
  overlayAbierto: boolean;
  onIniciarOrden: () => void;
}

/** Segundos transcurridos desde la última actualización, con tic de 1 s. */
function useSegundosDesde(iso: string | undefined): number | null {
  const [ahora, setAhora] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!iso) return null;
  const ms = ahora - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

/**
 * Page header de `Tiempo real` (Figma 2156:4014): título H2, subtítulo con el
 * contador de frescura y el turno, Secondary "Modo TV" y el único Primary.
 */
export function TiempoRealHeader({
  actualizadoEn,
  turnoLabel,
  turnoRango,
  overlayAbierto,
  onIniciarOrden,
}: TiempoRealHeaderProps) {
  const segundos = useSegundosDesde(actualizadoEn);
  const frescura =
    segundos === null ? 'Conectando con la planta…' : `Actualizado hace ${formatNumber(segundos)} s`;
  /* En móvil solo cabe la frescura; el turno aparece desde `sm`. El recuento de
     líneas por estado va en la fila de filtros, no aquí. */
  const detalle = turnoLabel ? `Turno ${turnoLabel} ${turnoRango ?? ''}`.trim() : '';

  return (
    <AppPageHeader
      title="Tiempo real"
      subtitle={
        <>
          {frescura}
          {detalle && <span className="hidden sm:inline">{` · ${detalle}`}</span>}
        </>
      }
      actions={
        <>
          <Button
            variant="secondary"
            asChild
            icon={<Icon name="monitor" size={20} />}
            className="max-sm:w-ctrl-md max-sm:px-2.5"
          >
            <a href="/tv" target="_blank" rel="noopener noreferrer" aria-label="Modo TV">
              <span className="max-sm:sr-only">Modo TV</span>
            </a>
          </Button>
          <Button
            variant="primary"
            icon={<Icon name="play-circle" size={20} />}
            disabled={overlayAbierto}
            onClick={onIniciarOrden}
          >
            Iniciar orden
          </Button>
        </>
      }
    />
  );
}
