'use client';

import type { Role } from '@mes/types';
import { useSessionStore } from '@/features/auth/session-store';

/** Acceso de solo lectura a la sesión, para vistas y guards de rol. */
export function useSession() {
  const token = useSessionStore((s) => s.token);
  const user = useSessionStore((s) => s.user);
  const hidratado = useSessionStore((s) => s.hidratado);
  const sincronizando = useSessionStore((s) => s.sincronizando);
  const logout = useSessionStore((s) => s.logout);

  return {
    token,
    user,
    hidratado,
    sincronizando,
    autenticado: Boolean(token && user),
    rol: user?.rol ?? null,
    tieneRol: (...roles: Role[]) => (user ? roles.includes(user.rol) : false),
    logout,
  };
}
