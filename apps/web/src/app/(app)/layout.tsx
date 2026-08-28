'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/layouts/AppShell';
import { ShellProvider } from '@/layouts/shell-context';
import { ShellSkeleton } from '@/layouts/ShellSkeleton';
import { useHidratado } from '@/hooks/use-hidratacion';
import { useSession } from '@/hooks/use-session';

/**
 * Shell + guard de sesión. Mientras zustand rehidrata se muestra el esqueleto
 * del shell (`Home / Dashboard / Loading`, Figma 2165:12928); si al terminar no
 * hay token se redirige a `/login`.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const hidratado = useHidratado();
  const router = useRouter();

  React.useEffect(() => {
    if (hidratado && !token) router.replace('/login');
  }, [hidratado, token, router]);

  if (!hidratado || !token) return <ShellSkeleton />;

  return (
    <ShellProvider>
      <AppShell>{children}</AppShell>
    </ShellProvider>
  );
}
