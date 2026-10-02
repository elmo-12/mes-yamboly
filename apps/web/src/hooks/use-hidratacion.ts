'use client';

import * as React from 'react';
import { useSession } from './use-session';

/**
 * `true` cuando ya se puede confiar en la sesión del cliente.
 *
 * Combina la bandera `hidratado` del store con el primer efecto del cliente:
 * el `persist` de zustand lee `localStorage` de forma síncrona al crear el
 * store, así que tras el montaje el token ya está disponible aunque la bandera
 * no se haya publicado. Evita además el desajuste de hidratación en SSR.
 */
export function useHidratado(): boolean {
  const { hidratado, sincronizando } = useSession();
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);
  /* Una pestaña nueva espera unos ms el token de las demás antes de ir a /login. */
  return (hidratado || montado) && !sincronizando;
}
