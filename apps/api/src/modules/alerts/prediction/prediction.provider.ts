import type { FactorAlerta, TipoAlerta } from '@mes/types';

/** Token de inyección del proveedor de predicciones. */
export const PREDICTION_PROVIDER = 'PREDICTION_PROVIDER';

/** Contexto que el motor de alertas entrega al modelo. */
export interface PredictionContext {
  tipo: TipoAlerta;
  lineaId: string;
  lineaCodigo: string;
  maquinaId?: string;
  maquinaNombre?: string;
  /** Turno objetivo de la ventana (`M` · `T` · `N`). */
  turno: string;
  /** Paradas de la línea en los últimos 7 días. */
  eventos7d: number;
  /** Paradas de la línea en los últimos 30 días. */
  eventos30d: number;
  /** Desvío de velocidad frente al estándar en % (negativo = por debajo). */
  desvioVelocidadPct: number;
  /** OEE acumulado del turno en %. */
  oeeActual: number;
  /** Minutos desde el último cambio de producto. */
  minutosDesdeCambio: number;
}

export interface PredictionResult {
  /** Probabilidad 0–100. */
  probabilidad: number;
  factores: FactorAlerta[];
}

/**
 * Fuente de la probabilidad de una alerta. Hay dos implementaciones:
 * reglas deterministas (por defecto) y servicio Python por HTTP.
 */
export interface PredictionProvider {
  readonly nombre: string;
  predict(ctx: PredictionContext): Promise<PredictionResult>;
}
