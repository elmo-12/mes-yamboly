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
  const { hidratado } = useSession();
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);
  return hidratado || montado;
}
