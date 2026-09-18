import { Injectable, Logger } from '@nestjs/common';
import type { Turno } from '@mes/types';
import type { ObjetivoModelo } from '../../../database/entities';
import { ENTRENAR_TIMEOUT_MS_DEFECTO } from './entrenamiento-continuo.constants';

/**
 * Cliente HTTP tipado del contrato **congelado** `docs/prediccion-python.md`
 * §3 (`POST /entrenar`) y §4 (resto de endpoints de administración de
 * modelos). Sólo lo usa `EntrenamientoContinuoService`: `/predict` lo sigue
 * consumiendo `alerts/prediction/python-http.provider.ts`, que este cliente
 * no toca ni reemplaza.
 *
 * Sigue la misma convención que `PythonHttpPredictionProvider`: lee
 * `process.env` directamente (no `ConfigService`) para poder construirse
 * igual dentro y fuera del contenedor de Nest, y no cae a ningún fallback —
 * si Python no responde, el llamador decide (omitir el entrenamiento, nunca
 * inventar un resultado).
 */

/* ------------------------------------------------------------------ */
/* Tipos del contrato (§3)                                             */
/* ------------------------------------------------------------------ */

export interface CatalogoFeaturePy {
  nombre: string;
  grupo: string;
  etiqueta: string;
}

/** Pliegue walk-forward expansivo, en la forma exacta que espera `POST /entrenar`. */
export interface PliegueEvaluacionPy {
  entrenamientoHasta: string;
  validacionDesde: string;
  validacionHasta: string;
}

export interface MuestraEntrenamientoPy {
  lineaId: string;
  lineaCodigo: string;
  fecha: string;
  turno: Turno;
  modo: 'anticipado';
  inicioTurno: string;
  features: Record<string, number>;
  huboParadaImprevista: number;
  mermaSobreEstandar: number;
  minutosImprevistos: number;
  tipoCausaDominante: string | null;
}

export interface CampeonPy {
  version: string;
  /** Obligatorio: Python reconstruye la familia del estimador a partir de aquí (contrato §3.2). */
  algoritmo: string;
  hiperparametros?: Record<string, unknown>;
}

export interface EntrenarRequest {
  version: string;
  objetivos: ObjetivoModelo[];
  snapshot: { sha256: string; filas: number; desde: string; hasta: string };
  catalogo: CatalogoFeaturePy[];
  prohibidas: string[];
  evaluacion: { pruebaDesde: string; pliegues: PliegueEvaluacionPy[] };
  muestras: MuestraEntrenamientoPy[];
  campeon: CampeonPy | null;
  semilla: number;
}

/** `walkForward` del bloque de un objetivo binario: recall/precision en 0–1, igual que `umbral`. */
export interface WalkForwardPy {
  aucRoc: number;
  prAuc: number;
  f1: number;
  precision: number;
  recall: number;
  brier: number;
  vp: number;
  fp: number;
  vn: number;
  fn: number;
  umbral: number;
}

export interface ProbabilidadFueraPy {
  lineaId: string;
  lineaCodigo: string;
  fecha: string;
  turno: string;
  y: number;
  p: number;
  minutosImprevistos: number;
}

export interface ArtefactoPy {
  uri: string;
  sha256: string;
  bytes: number;
}

/** Bloque de resultado de un objetivo **binario** (`parada_imprevista`, `merma_sobre_estandar`). */
export interface ResultadoClasificacionPy {
  algoritmo: string;
  hiperparametros: Record<string, unknown>;
  muestras: number;
  features: number;
  tasaPositivos: number;
  walkForward: WalkForwardPy;
  aucPrueba: number;
  aucRetro: number;
  liftTop3: number;
  corteEntrenamiento: string;
  cortePrueba: string;
  /** Pliegues que Python usó de verdad: Nest los contrasta contra los suyos (§3, guardarraíl anti off-by-one). */
  pliegues: PliegueEvaluacionPy[];
  importancias: { nombre: string; importancia: number }[];
  fuera: ProbabilidadFueraPy[];
  alternativas: { algoritmo: string; prAuc: number }[];
  /** El campeón vigente reevaluado sobre el snapshot de esta corrida — la comparación justa. */
  campeonReevaluado: { version: string; walkForward: WalkForwardPy } | null;
  artefacto: ArtefactoPy;
}

/** Bloque de `minutos_imprevistos` (regresión). */
export interface ResultadoRegresionPy {
  algoritmo?: string;
  hiperparametros?: Record<string, unknown>;
  artefacto?: ArtefactoPy;
  metricas: { mae: number; rmse: number; r2: number };
  campeonReevaluado?: { version: string; metricas: { mae: number; rmse: number; r2: number } } | null;
}

/** Bloque de `causa_dominante` (multiclase). */
export interface ResultadoMulticlasePy {
  algoritmo?: string;
  hiperparametros?: Record<string, unknown>;
  artefacto?: ArtefactoPy;
  metricas: { f1Macro: number; accuracy: number; top2: number };
  campeonReevaluado?: { version: string; metricas: { f1Macro: number; accuracy: number; top2: number } } | null;
}

/**
 * Un objetivo que Python no pudo entrenar (clases insuficientes, varianza cero,
 * sin pliegues utilizables). Llega en lugar del bloque normal y **no** tumba la
 * corrida: los demás objetivos siguen su curso (contrato §3.3).
 */
export interface ResultadoFalloPy {
  error: string;
}

export type ResultadoObjetivoPy =
  | ResultadoClasificacionPy
  | ResultadoRegresionPy
  | ResultadoMulticlasePy
  | ResultadoFalloPy;

export interface EntrenarResponse {
  runId: string;
  resultados: Partial<Record<ObjetivoModelo, ResultadoObjetivoPy>>;
  duracionMs: number;
}

/** §4 — `GET /salud`: siempre 200 si el proceso vive; `degradado` = sin modelo cargado. */
export interface SaludPy {
  estado: 'ok' | 'degradado';
  modeloCargado: boolean;
  version: string | null;
  sklearn: string;
  uptimeS: number;
}

/** §4 — `GET /modelo/actual`: el modelo que de verdad sirve `/predict` ahora mismo. */
export interface ModeloActualPy {
  version: string;
  objetivo: ObjetivoModelo;
  algoritmo: string;
  hiperparametros: Record<string, unknown>;
  nombres: string[];
  entrenadoEn: string;
  artefactoSha256: string;
  umbralDecisionPct: number;
}

/** Error tipado con el status HTTP, para que el orquestador distinga 409/422/500/caído. */
export class PythonEntrenamientoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cuerpo?: unknown,
  ) {
    super(message);
    this.name = 'PythonEntrenamientoError';
  }
}

@Injectable()
export class PythonEntrenamientoClient {
  private readonly logger = new Logger(PythonEntrenamientoClient.name);

  constructor(
    private readonly url = process.env.PREDICTION_SERVICE_URL,
    private readonly token = process.env.PREDICCION_TOKEN,
    private readonly timeoutEntrenarMs = Number(
      process.env.PREDICTION_TRAIN_TIMEOUT_MS ?? ENTRENAR_TIMEOUT_MS_DEFECTO,
    ),
  ) {}

  get disponible(): boolean {
    return Boolean(this.url);
  }

  /**
   * `null` si Python no responde o tarda más que `timeoutMs`: el orquestador
   * lo trata como «no hay entrenamiento posible», nunca como error duro.
   */
  async salud(timeoutMs: number): Promise<SaludPy | null> {
    if (!this.url) return null;
    try {
      return await this.solicitar<SaludPy>('GET', '/salud', undefined, timeoutMs);
    } catch (error: unknown) {
      this.logger.warn(`GET /salud falló: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * `null` = Python respondió 404 (no hay modelo activo). `undefined` = Python
   * no respondió (caído, timeout, red): son casos distintos para la
   * reconciliación de `OnApplicationBootstrap`, que no debe archivar una
   * versión sólo porque Python esté reiniciando.
   */
  async modeloActual(): Promise<ModeloActualPy | null | undefined> {
    if (!this.url) return undefined;
    try {
      return await this.solicitar<ModeloActualPy>('GET', '/modelo/actual', undefined, 5_000);
    } catch (error: unknown) {
      if (error instanceof PythonEntrenamientoError && error.status === 404) return null;
      this.logger.warn(`GET /modelo/actual falló: ${(error as Error).message}`);
      return undefined;
    }
  }

  /** Síncrono, hasta `PREDICTION_TRAIN_TIMEOUT_MS` (600 s por defecto). Lanza en 409/422/500. */
  async entrenar(cuerpo: EntrenarRequest): Promise<EntrenarResponse> {
    if (!this.url) throw new PythonEntrenamientoError('PREDICTION_SERVICE_URL no configurada');
    return this.solicitar<EntrenarResponse>('POST', '/entrenar', cuerpo, this.timeoutEntrenarMs);
  }

  /** 404 si Python no tiene el artefacto de esa versión/objetivo. */
  async activar(objetivo: ObjetivoModelo, version: string): Promise<void> {
    if (!this.url) throw new PythonEntrenamientoError('PREDICTION_SERVICE_URL no configurada');
    await this.solicitar<void>('POST', `/modelo/${objetivo}/${version}/activar`, undefined, 10_000);
  }

  async desactivar(objetivo: ObjetivoModelo): Promise<void> {
    if (!this.url) throw new PythonEntrenamientoError('PREDICTION_SERVICE_URL no configurada');
    await this.solicitar<void>('POST', `/modelo/${objetivo}/desactivar`, undefined, 10_000);
  }

  private async solicitar<T>(
    metodo: 'GET' | 'POST',
    ruta: string,
    cuerpo: unknown,
    timeoutMs: number,
  ): Promise<T> {
    const abort = new AbortController();
    const temporizador = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.token) headers['X-Internal-Token'] = this.token;
      const respuesta = await fetch(`${this.url!.replace(/\/$/, '')}${ruta}`, {
        method: metodo,
        headers,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: abort.signal,
      });
      const texto = await respuesta.text();
      const datos: unknown = texto ? JSON.parse(texto) : undefined;
      if (!respuesta.ok) {
        throw new PythonEntrenamientoError(`HTTP ${respuesta.status} en ${metodo} ${ruta}`, respuesta.status, datos);
      }
      return datos as T;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
