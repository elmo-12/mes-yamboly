import { LookupsService, type Lookups } from '../../common/mappers/lookups.service';
import { redondear } from '../../common/utils/query';
import type { OrdenSap } from '../../database/entities';

/** Velocidad estándar con la que nacería una orden a partir de una fila SAP. */
export interface VelocidadResuelta {
  /** u/min, la magnitud que congela la orden y consume el OEE. */
  velocidadUnidMin: number;
  fuente: 'par' | 'sap';
  /** Par producto × línea de origen; `null` cuando la velocidad sale del texto SAP. */
  velocidadEstandarId: string | null;
}

/**
 * Resuelve la velocidad estándar de una orden SAP:
 *
 *   1. el par producto × línea **activo** del maestro del MES (la misma regla
 *      que el alta manual tenía antes de SAP);
 *   2. si el par no existe, la del texto SAP (`'22800 u/h'` → 380 u/min), que es
 *      la que el planificador fijó para esa orden;
 *   3. si tampoco la hay, `null`: la orden no puede iniciarse (el OEE quedaría
 *      sin referencia de desempeño).
 */
export function resolverVelocidadSap(
  lookups: Lookups,
  fila: Pick<OrdenSap, 'productoId' | 'lineaId' | 'velocidadUnidHora'>,
): VelocidadResuelta | null {
  const par = fila.productoId
    ? LookupsService.parActivo(lookups, fila.productoId, fila.lineaId)
    : undefined;
  if (par) return { velocidadUnidMin: par.velocidadUnidMin, fuente: 'par', velocidadEstandarId: par.id };
  if (fila.velocidadUnidHora && fila.velocidadUnidHora > 0) {
    return {
      velocidadUnidMin: redondear(fila.velocidadUnidHora / 60, 1),
      fuente: 'sap',
      velocidadEstandarId: null,
    };
  }
  return null;
}
