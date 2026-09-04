import type { EvaluacionCalidad } from '../../database/entities';

/**
 * Reglas del Anexo 03 (TCI). Cada criterio se deriva del propio registro y
 * puede sobrescribirse manualmente desde la vista 09.C (`override*`).
 */
export interface CriteriosTci {
  completo: boolean;
  preciso: boolean;
  trazable: boolean;
  valido: boolean;
}

/** Completo: todos los campos obligatorios del formulario están presentes. */
export function esCompleto(e: EvaluacionCalidad): boolean {
  return e.overrideCompleto ?? e.camposObligatoriosCompletos;
}

/** Preciso: la duración es mayor que 0 y la causa es de último nivel. */
export function esPreciso(e: EvaluacionCalidad): boolean {
  return e.overridePreciso ?? (e.duracionMin > 0 && e.causaEspecifica);
}

/** Trazable: el registro apunta a una orden, una máquina y un responsable. */
export function esTrazable(e: EvaluacionCalidad): boolean {
  return e.overrideTrazable ?? (e.tieneOrden && e.tieneLinea && e.tieneResponsable);
}

/** Válido: cumple los tres criterios anteriores. */
export function evaluarCriterios(e: EvaluacionCalidad): CriteriosTci {
  const completo = esCompleto(e);
  const preciso = esPreciso(e);
  const trazable = esTrazable(e);
  return { completo, preciso, trazable, valido: completo && preciso && trazable };
}
