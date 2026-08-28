'use client';

import { useEffect, useState } from 'react';
import { isMock } from './data-source';

/**
 * Arranca el service worker de msw cuando `NEXT_PUBLIC_DATA_SOURCE=mock`.
 * Mientras el worker no está listo no se renderiza nada, para que ninguna
 * petición escape sin interceptar.
 */
export function MockProvider({ children }: { children: React.ReactNode }) {
  const mock = isMock();
  const [listo, setListo] = useState(!mock);

  useEffect(() => {
    if (!mock) return;
    let cancelado = false;
    void (async () => {
      const { worker } = await import('@/mocks/browser');
      await worker.start({
        onUnhandledRequest: 'bypass',
        serviceWorker: { url: '/mockServiceWorker.js' },
        quiet: true,
      });
      if (!cancelado) setListo(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [mock]);

  if (!listo) return null;
  return <>{children}</>;
}
