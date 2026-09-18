import { Injectable, Logger } from '@nestjs/common';
import type { PredictionContext, PredictionProvider, PredictionResult } from './prediction.provider';
import type { PythonHttpPredictionProvider } from './python-http.provider';
import type { RuleBasedPredictionProvider } from './rule-based.provider';

/** Nivel de la cascada que finalmente respondió. */
export type NivelCascada = 'python-http' | 'reglas';

/** Cuánto vive una respuesta precargada con `precalcular()` antes de descartarse
 * sin usar. Sólo es una red de seguridad: en el camino normal la reutiliza el
 * mismo ciclo síncrono unos milisegundos después de calcularla (ver
 * `RiesgoService.ejecutarCiclo`); el TTL evita que una entrada que nunca se
 * consumió (la alerta no llegó a dispararse) contamine un ciclo futuro. */
const TTL_PRECALCULO_MS = 5_000;

/**
 * Cascada de predicción (§5.2 del plan de IA): microservicio Python → reglas
 * deterministas. Implementa la misma interfaz `PredictionProvider`, así que
 * `AlertsEngineService` no cambia ni una línea.
 *
 * Python es hoy el único motor de modelado entrenado; el nivel intermedio de
 * modelo local en TypeScript se retiró (F0). El punto de la cascada sigue
 * siendo que apagar Python (`PREDICTION_SERVICE_URL` vacía, o el circuit
 * breaker del provider abierto) **no puede** degradar ninguna pantalla: sin
 * servicio se cae directamente a las reglas de siempre.
 */
@Injectable()
export class PrediccionCascadaProvider implements PredictionProvider {
  private readonly logger = new Logger(PrediccionCascadaProvider.name);
  private ultimoNivel: NivelCascada = 'reglas';
  private readonly precalculos = new Map<string, { resultado: PredictionResult; expira: number }>();

  constructor(
    private readonly python: PythonHttpPredictionProvider | null,
    private readonly reglas: RuleBasedPredictionProvider,
  ) {}

  /** Incluye el nivel que sirvió la última predicción: lo registra el motor. */
  get nombre(): string {
    return `cascada:${this.ultimoNivel}`;
  }

  async predict(ctx: PredictionContext): Promise<PredictionResult> {
    const clave = this.clave(ctx);
    const precalculado = this.precalculos.get(clave);
    if (precalculado) {
      this.precalculos.delete(clave);
      if (precalculado.expira > this.ahora()) return precalculado.resultado;
    }

    if (this.python) {
      const remoto = await this.python.intentar(ctx);
      if (remoto) {
        this.ultimoNivel = 'python-http';
        return remoto;
      }
    }
    if (this.ultimoNivel !== 'reglas') {
      this.logger.debug('Python no disponible: la cascada cae en reglas deterministas');
    }
    this.ultimoNivel = 'reglas';
    return this.reglas.predict(ctx);
  }

  /**
   * Deja `resultado` listo para que la próxima llamada con el mismo
   * `tipo`/`lineaId`/`turno` lo reutilice en vez de recalcularlo (ver
   * `RiesgoService.ejecutarCiclo`, punto D5 del plan).
   */
  precalcular(ctx: PredictionContext, resultado: PredictionResult): void {
    this.precalculos.set(this.clave(ctx), { resultado, expira: this.ahora() + TTL_PRECALCULO_MS });
  }

  private clave(ctx: PredictionContext): string {
    return `${ctx.tipo}|${ctx.lineaId}|${ctx.turno}`;
  }

  /** Punto único de reloj, sobrescribible en tests. */
  protected ahora(): number {
    return Date.now();
  }
}
