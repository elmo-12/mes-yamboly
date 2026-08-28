'use client';

import * as React from 'react';

const CLAVE = 'mes-yamboly.densidad';

/** Densidad de fila del MDS (§4.4); `/perfil` sólo alterna standard ↔ compact. */
export type Densidad = 'standard' | 'compact';

function leer(): Densidad {
  if (typeof window === 'undefined') return 'standard';
  return window.localStorage.getItem(CLAVE) === 'compact' ? 'compact' : 'standard';
}

function aplicar(densidad: Densidad): void {
  document.documentElement.dataset.density = densidad;
}

/**
 * Aplica la densidad guardada al arrancar la app, para que la preferencia valga
 * en todas las vistas y no sólo en `/perfil`.
 */
export function useAplicarDensidadGuardada(): void {
  React.useEffect(() => {
    aplicar(leer());
  }, []);
}

/**
 * Preferencia de densidad, persistida en `localStorage` y aplicada al `<html>`
 * como `data-density`, que es lo que leen los tokens `--row-h` de `theme.css`.
 */
export function useDensidad(): [Densidad, (valor: Densidad) => void] {
  const [densidad, setDensidad] = React.useState<Densidad>('standard');

  React.useEffect(() => {
    const guardada = leer();
    setDensidad(guardada);
    aplicar(guardada);
  }, []);

  const cambiar = React.useCallback((valor: Densidad) => {
    setDensidad(valor);
    aplicar(valor);
    window.localStorage.setItem(CLAVE, valor);
  }, []);

  return [densidad, cambiar];
}
