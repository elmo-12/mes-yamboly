import { Injectable, Logger } from '@nestjs/common';
import type { FactorAlerta } from '@mes/types';
import { RuleBasedPredictionProvider } from './rule-based.provider';
import type { PredictionContext, PredictionProvider, PredictionResult } from './prediction.provider';

interface RespuestaPython {
  probabilidad?: number;
  factores?: FactorAlerta[];
}

/**
 * Puente con el servicio de inferencia en Python (`PREDICTION_SERVICE_URL`).
 * Si la variable no está definida, la llamada falla o la respuesta es inválida,
 * cae en el proveedor de reglas para que el motor nunca se quede sin predicción.
 */
@Injectable()
export class PythonHttpPredictionProvider implements PredictionProvider {
  readonly nombre = 'python-http';
  private readonly logger = new Logger(PythonHttpPredictionProvider.name);

  constructor(
    private readonly fallback: RuleBasedPredictionProvider,
    private readonly url = process.env.PREDICTION_SERVICE_URL,
    private readonly timeoutMs = Number(process.env.PREDICTION_TIMEOUT_MS ?? 1500),
  ) {}

  async predict(ctx: PredictionContext): Promise<PredictionResult> {
    return (await this.intentar(ctx)) ?? this.fallback.predict(ctx);
  }

  /**
   * Devuelve `null` —en vez de caer en reglas— cuando el servicio no está o no
   * responde, para que la cascada pueda probar antes el modelo local entrenado.
   */
  async intentar(ctx: PredictionContext): Promise<PredictionResult | null> {
    if (!this.url) return null;

    const abort = new AbortController();
    const temporizador = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const respuesta = await fetch(`${this.url.replace(/\/$/, '')}/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ctx),
        signal: abort.signal,
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const cuerpo = (await respuesta.json()) as RespuestaPython;
      if (typeof cuerpo.probabilidad !== 'number' || !Array.isArray(cuerpo.factores)) {
        throw new Error('Respuesta sin probabilidad o factores');
      }
      return { probabilidad: cuerpo.probabilidad, factores: cuerpo.factores };
    } catch (error: unknown) {
      this.logger.warn(
        `Servicio de predicción no disponible (${(error as Error).message}); se baja de nivel`,
      );
      return null;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
