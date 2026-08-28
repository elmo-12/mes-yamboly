'use client';

import type { Role } from '@mes/types';
import { useSession } from '@/hooks/use-session';
import { Forbidden } from './Forbidden';

export interface RoleGateProps {
  roles: readonly Role[];
  children: React.ReactNode;
  /** Qué se intentó abrir, para el mensaje de `Forbidden`. */
  recurso?: string;
  /** Sustituye el `Forbidden` por otro contenido. */
  fallback?: React.ReactNode;
}

/** Renderiza `children` solo si el rol de la sesión está permitido. */
export function RoleGate({ roles, children, recurso, fallback }: RoleGateProps) {
  const { rol } = useSession();
  if (rol && roles.includes(rol)) return <>{children}</>;
  return <>{fallback ?? <Forbidden recurso={recurso} />}</>;
}
