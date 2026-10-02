import { ForbiddenException } from '@nestjs/common';
import { ROLES_CORRIGEN_ORDEN_CERRADA, type EstadoOrden, type Role } from '@mes/types';
import { ConflictoException, ValidationException } from '../exceptions/business.exception';
import { assertAccesoLinea } from './acceso-linea';

interface OrdenMinima {
  id: string;
  codigo?: string;
  lineaId: string;
  estado: EstadoOrden;
}

/**
 * Reglas comunes para registrar o corregir paradas, mermas y velocidades de una
 * orden:
 *
 * - `validada` → 409: la orden ya no admite cambios.
 * - finalizada pendiente de validar (`por_validar`, `cerrada`, `incompleta`) →
 *   solo `jefe` y `supervisor` (403 al resto).
 * - la línea enviada debe ser la de la orden → 422 `lineaId`.
 * - un maquinista solo opera en su línea → 403 ({@link assertAccesoLinea}).
 */
export function assertCapturaEnOrden(
  orden: OrdenMinima,
  usuario: { rol: Role; lineaId?: string | null },
  lineaId?: string,
): void {
  if (orden.estado === 'validada') {
    throw new ConflictoException('La orden ya está validada: no admite registros ni correcciones', {
      ordenId: orden.id,
      estado: orden.estado,
    });
  }
  if (orden.estado !== 'en_curso' && !ROLES_CORRIGEN_ORDEN_CERRADA.includes(usuario.rol)) {
    throw new ForbiddenException(
      'La orden ya fue finalizada: solo un supervisor o el jefe pueden añadir o corregir registros',
    );
  }
  if (lineaId !== undefined && lineaId !== orden.lineaId) {
    throw new ValidationException({
      lineaId: 'La línea no coincide con la de la orden de fabricación',
    });
  }
  assertAccesoLinea(usuario, orden.lineaId);
}
