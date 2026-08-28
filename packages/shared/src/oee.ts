import type { OeeDetalle } from '@mes/types';

export interface OeeInput {
  /** Minutos programados del turno. */
  tiempoPlanificadoMin: number;
  /** Minutos de parada que afectan OEE. */
  paradasMin: number;
  /** Unidades totales producidas (buenas + rechazadas). */
  unidadesProducidas: number;
  /** Unidades conformes (conteo de codificadora / descontando merma PT). */
  unidadesBuenas: number;
  /** Unidades por minuto de referencia del producto. */
  velocidadEstandar: number;
}

export const META_OEE = 85;

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Disponibilidad = tiempo operativo / tiempo planificado. */
export function calcDisponibilidad(tiempoPlanificadoMin: number, paradasMin: number): number {
  if (tiempoPlanificadoMin <= 0) return 0;
  const operativo = Math.max(0, tiempoPlanificadoMin - paradasMin);
  return round1(clampPct((operativo / tiempoPlanificadoMin) * 100));
}

/** Desempeño = producción real / producción teórica en el tiempo operativo. */
export function calcDesempeno(
  unidadesProducidas: number,
  tiempoOperativoMin: number,
  velocidadEstandar: number
): number {
  const teorico = tiempoOperativoMin * velocidadEstandar;
  if (teorico <= 0) return 0;
  return round1(clampPct((unidadesProducidas / teorico) * 100));
}

/** Calidad = unidades conformes / unidades producidas. */
export function calcCalidad(unidadesProducidas: number, unidadesBuenas: number): number {
  if (unidadesProducidas <= 0) return 0;
  return round1(clampPct((unidadesBuenas / unidadesProducidas) * 100));
}

/** OEE = Disponibilidad × Desempeño × Calidad (los tres en %). */
export function calcOee(disponibilidad: number, desempeno: number, calidad: number): number {
  return round1(clampPct((disponibilidad / 100) * (desempeno / 100) * (calidad / 100) * 100));
}

/** Calcula el detalle completo de OEE a partir de los datos crudos del turno. */
export function computeOee(input: OeeInput): OeeDetalle {
  const disponibilidad = calcDisponibilidad(input.tiempoPlanificadoMin, input.paradasMin);
  const tiempoOperativoMin = Math.max(0, input.tiempoPlanificadoMin - input.paradasMin);
  const desempeno = calcDesempeno(
    input.unidadesProducidas,
    tiempoOperativoMin,
    input.velocidadEstandar
  );
  const calidad = calcCalidad(input.unidadesProducidas, input.unidadesBuenas);
  return { oee: calcOee(disponibilidad, desempeno, calidad), disponibilidad, desempeno, calidad };
}

/** Clasificación semántica para badges: ≥ 85 bueno, 70–84 aceptable, < 70 crítico. */
export function clasificarOee(oee: number): 'bueno' | 'aceptable' | 'critico' {
  if (oee >= META_OEE) return 'bueno';
  if (oee >= 70) return 'aceptable';
  return 'critico';
}

/** Desvío porcentual de la velocidad real frente al estándar (negativo = por debajo). */
export function calcDesvioVelocidad(real: number, estandar: number): number {
  if (estandar <= 0) return 0;
  return round1(((real - estandar) / estandar) * 100);
}
