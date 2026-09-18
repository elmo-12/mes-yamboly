import type { FactorAlerta, TipoAlerta } from '@mes/types';

/** Token de inyección del proveedor de predicciones. */
export const PREDICTION_PROVIDER = 'PREDICTION_PROVIDER';

/** Contexto que el motor de alertas entrega al modelo. */
export interface PredictionContext {
  tipo: TipoAlerta;
  lineaId: string;
  lineaCodigo: string;
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
  /**
   * Vector completo de features del feature store, cuando quien pide la
   * predicción lo tiene (el ciclo de inferencia). Opcional: el motor de alertas
   * sigue enviando sólo el contexto estrecho de arriba. (aditivo · plan de IA §5.2)
   */
  features?: Record<string, number>;
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
  /**
   * Opcional: deja precargado el resultado de un `predict()` ya resuelto para
   * que una llamada posterior con el mismo `tipo`/`lineaId`/`turno` (aunque
   * traiga menos contexto, p. ej. sin `features`) reutilice esa respuesta en
   * vez de recalcularla. Sólo `PrediccionCascadaProvider` lo implementa; existe
   * para que `RiesgoService` y `AlertsEngineService` no puedan puntuar la misma
   * línea dos veces con resultados distintos dentro del mismo ciclo (§5.2).
   */
  precalcular?(ctx: PredictionContext, resultado: PredictionResult): void;
}
