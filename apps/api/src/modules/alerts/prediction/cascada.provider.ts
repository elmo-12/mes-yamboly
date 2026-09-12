import { Injectable, Logger } from '@nestjs/common';
import type { PredictionContext, PredictionProvider, PredictionResult } from './prediction.provider';
import type { ModeloLocalPredictionProvider } from './modelo-local.provider';
import type { PythonHttpPredictionProvider } from './python-http.provider';
import type { RuleBasedPredictionProvider } from './rule-based.provider';

/** Nivel de la cascada que finalmente respondió. */
export type NivelCascada = 'python-http' | 'modelo-local' | 'reglas';

/**
 * Cascada de predicción (§5.2 del plan de IA): microservicio Python → modelo
 * local entrenado → reglas deterministas. Implementa la misma interfaz
 * `PredictionProvider`, así que `AlertsEngineService` no cambia ni una línea.
 *
 * El punto de la cascada es que apagar Python (`PREDICTION_SERVICE_URL` vacía,
 * que es el caso normal hoy) **no puede** degradar ninguna pantalla: sin
 * servicio se usa el modelo entrenado, y en arranque en frío —sin muestras ni
 * versión vigente— se usan las reglas de siempre.
 */
@Injectable()
export class PrediccionCascadaProvider implements PredictionProvider {
  private readonly logger = new Logger(PrediccionCascadaProvider.name);
  private ultimoNivel: NivelCascada = 'reglas';

  constructor(
    private readonly python: PythonHttpPredictionProvider | null,
    private readonly modeloLocal: ModeloLocalPredictionProvider,
    private readonly reglas: RuleBasedPredictionProvider,
  ) {}

  /** Incluye el nivel que sirvió la última predicción: lo registra el motor. */
  get nombre(): string {
    return `cascada:${this.ultimoNivel}`;
  }

  async predict(ctx: PredictionContext): Promise<PredictionResult> {
    if (this.python) {
      const remoto = await this.python.intentar(ctx);
      if (remoto) {
        this.ultimoNivel = 'python-http';
        return remoto;
      }
    }
    const local = await this.modeloLocal.intentar(ctx);
    if (local) {
      this.ultimoNivel = 'modelo-local';
      return local;
    }
    if (this.ultimoNivel !== 'reglas') {
      this.logger.debug('Sin modelo vigente: la cascada cae en reglas deterministas');
    }
    this.ultimoNivel = 'reglas';
    return this.reglas.predict(ctx);
  }
}
