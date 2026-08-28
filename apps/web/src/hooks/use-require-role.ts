'use client';

import type { Role } from '@mes/types';
import { useHidratado } from './use-hidratacion';
import { useSession } from './use-session';

export interface RequireRoleResult {
  /** `false` mientras zustand rehidrata: la vista debe mostrar su skeleton. */
  listo: boolean;
  permitido: boolean;
}

/**
 * Comprobación de rol para una vista completa. Las páginas hacen:
 *
 * ```tsx
 * const { listo, permitido } = useRequireRole(['jefe', 'investigador']);
 * if (!listo) return <PageSkeleton />;
 * if (!permitido) return <Forbidden recurso="Evidencia de tesis" />;
 * ```
 *
 * No redirige: el acceso a la app ya lo cubre el guard de `(app)/layout.tsx`.
 */
export function useRequireRole(roles: readonly Role[]): RequireRoleResult {
  const { rol } = useSession();
  const listo = useHidratado();
  return {
    listo,
    permitido: rol !== null && roles.includes(rol),
  };
}
