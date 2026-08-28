'use client';

import { Toaster } from '@mes/ui';
import { MockProvider } from '@/services/api/MockProvider';
import { QueryProvider } from '@/services/api/QueryProvider';
import { useAplicarDensidadGuardada } from '@/hooks/use-densidad';
/* Registra el token de sesión en el cliente HTTP en cuanto arranca la app. */
import '@/features/auth/session-store';

export function Providers({ children }: { children: React.ReactNode }) {
  /* Preferencia de densidad de `/perfil`: se aplica a toda la app. */
  useAplicarDensidadGuardada();

  return (
    <QueryProvider>
      <MockProvider>
        {children}
        {/* Único Toaster de la app: los toast de éxito/error de todas las vistas. */}
        <Toaster />
      </MockProvider>
    </QueryProvider>
  );
}
