import { MENSAJE_CONFLICTO_VERSION } from '@mes/types';
import { ApiClientError } from '@/services/api/client';

/**
 * `true` si la API rechazó el guardado por concurrencia optimista (409: otra
 * persona guardó el registro después de que lo abrieras). Distingue este 409
 * del de duplicado (código o par producto × línea ya existentes).
 */
export function esConflictoVersion(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.statusCode === 409 &&
    (error.message === MENSAJE_CONFLICTO_VERSION ||
      (error.details !== undefined && 'versionEnviada' in error.details))
  );
}

/** Texto del toast para el 409 de versión. */
export const TOAST_CONFLICTO_VERSION = {
  titulo: 'Otra persona guardó cambios antes que tú',
  descripcion: 'Recargamos los datos: revisa la versión actual y vuelve a guardar.',
} as const;
