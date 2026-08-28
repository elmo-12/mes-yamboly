'use client';

import * as React from 'react';
import { Button, EmptyState, Icon } from '@mes/ui';
import type { EstadoDatos } from '@mes/types';
import { formatNumber, formatPct } from '@mes/shared';
import { AppLink } from '@/components/AppLink';

export interface DatosInsuficientesProps {
  estado: EstadoDatos;
  /** Abre la pestaña Modelo con la metodología CRISP-DM. */
  onVerMetodologia: () => void;
}

/**
 * `Analítica IA / Datos insuficientes` (Figma 2156:4745 → 2163:18256):
 * panel `background/subtle` r12 con el Empty state, la barra de progreso de
 * eventos (560) y las dos acciones.
 */
export function DatosInsuficientes({ estado, onVerMetodologia }: DatosInsuficientesProps) {
  const faltan = Math.max(0, estado.requeridos - estado.eventos);

  return (
    <div className="flex flex-col items-center gap-6 rounded-md bg-background-subtle px-8 py-16">
      <EmptyState
        icon={<Icon name="inbox" size={40} />}
        title="Aún no hay suficientes datos para entrenar el modelo"
        description={`El modelo necesita al menos ${formatNumber(estado.requeridos)} eventos registrados para generar predicciones fiables. Hoy la planta lleva ${formatNumber(estado.eventos)} eventos capturados.`}
      />

      <div className="flex w-full max-w-[560px] flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-body-md text-text-primary">
            {formatNumber(estado.eventos)} / {formatNumber(estado.requeridos)} eventos registrados
          </span>
          <span className="flex-1" />
          <span className="text-body-md font-medium tabular text-primary">
            {formatPct(estado.progresoPct)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(estado.progresoPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Avance de eventos registrados"
          className="h-2 w-full overflow-hidden rounded-xs bg-border"
        >
          <div
            className="h-full rounded-xs bg-primary transition-[width] duration-200 ease-standard"
            style={{ width: `${Math.min(100, estado.progresoPct)}%` }}
          />
        </div>
        <p className="text-center text-body-sm text-text-secondary">
          Faltan {formatNumber(faltan)} eventos · {estado.estimacion}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={onVerMetodologia}>
          Ver metodología CRISP-DM
        </Button>
        <Button variant="primary" asChild>
          <AppLink href="/tiempo-real" className="text-primary-foreground hover:no-underline">
            Ir a registro de paradas
          </AppLink>
        </Button>
      </div>
    </div>
  );
}
