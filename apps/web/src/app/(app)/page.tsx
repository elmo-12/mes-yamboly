'use client';

import type { Role } from '@mes/types';
import { DashboardJefe, DashboardMaquinista, HomeSkeleton } from '@/features/home/components';
import { useSession } from '@/hooks/use-session';

/** Roles que ven el panel operativo de línea en lugar del panel de gestión. */
const ROLES_LINEA: readonly Role[] = ['maquinista', 'mermas'];

/**
 * Home (`/`) — `Home / Dashboard Jefe` (Figma 2163:17435) o
 * `Home / Dashboard Maquinista` (2165:769) según el rol de la sesión.
 */
export default function Page() {
  const { user } = useSession();

  if (!user) return <HomeSkeleton />;

  return ROLES_LINEA.includes(user.rol) ? (
    <DashboardMaquinista user={user} />
  ) : (
    <DashboardJefe user={user} />
  );
}
