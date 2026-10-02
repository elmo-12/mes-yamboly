import { ForbiddenException } from '@nestjs/common';
import type { Role } from '@mes/types';

/**
 * Comprueba que el usuario puede operar sobre `lineaId`.
 *
 * - `jefe` y `supervisor` pasan siempre.
 * - `maquinista` solo en su línea asignada (`lineaId` del JWT); sin línea → 403.
 * - El resto de roles no está atado a una línea: lo que pueden hacer lo decide
 *   `@Roles` en cada handler (ver la matriz de `@mes/types/permisos-captura`).
 *
 * Lanza 403 (`ForbiddenException`) con un mensaje en español.
 */
export function assertAccesoLinea(
  usuario: { rol: Role; lineaId?: string | null },
  lineaId: string,
): void {
  if (usuario.rol !== 'maquinista') return;
  if (!usuario.lineaId || usuario.lineaId !== lineaId) {
    throw new ForbiddenException('Solo puedes registrar en tu línea asignada');
  }
}

/** Variante booleana de {@link assertAccesoLinea}. */
export function tieneAccesoLinea(
  usuario: { rol: Role; lineaId?: string | null },
  lineaId: string,
): boolean {
  return usuario.rol !== 'maquinista' || (!!usuario.lineaId && usuario.lineaId === lineaId);
}
