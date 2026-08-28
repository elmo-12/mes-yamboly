'use client';

import Link from 'next/link';
import { Button, EmptyState, Icon } from '@mes/ui';
import { AppShell } from '@/layouts/AppShell';
import { ShellProvider } from '@/layouts/shell-context';
import { PublicLayout } from '@/layouts/PublicLayout';
import { useHidratado } from '@/hooks/use-hidratacion';
import { useSession } from '@/hooks/use-session';

/**
 * 404. Con sesión se muestra dentro del shell (el usuario conserva la
 * navegación); sin sesión cae al layout público, porque `not-found` también
 * cubre rutas fuera de `(app)` y no habría token que validar.
 */
export default function NotFound() {
  const { token } = useSession();
  const hidratado = useHidratado();

  const contenido = (
    <EmptyState
      variant="no-results"
      icon={<Icon name="search" size={40} />}
      title="Página no encontrada"
      description="La dirección que abriste no existe o cambió de sitio. Vuelve al inicio para seguir trabajando."
      action={
        <Button variant="secondary" asChild icon={<Icon name="home-01" />}>
          <Link href="/">Ir al inicio</Link>
        </Button>
      }
    />
  );

  if (hidratado && token) {
    return (
      <ShellProvider>
        <AppShell>{contenido}</AppShell>
      </ShellProvider>
    );
  }

  return <PublicLayout>{contenido}</PublicLayout>;
}
