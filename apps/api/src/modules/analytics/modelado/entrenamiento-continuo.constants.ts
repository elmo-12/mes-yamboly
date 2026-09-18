import type { ObjetivoModelo } from '../../../database/entities';

/**
 * Guardarraíles y parámetros del orquestador de entrenamiento continuo
 * (bloque B del plan de IA). Todo lo que aquí es un umbral de negocio vive en
 * este fichero y en ningún otro, para que auditar la política de promoción
 * sea leer un solo sitio.
 */

/** Los 4 objetivos que Python entrena en cada corrida (`docs/prediccion-python.md` §3/§5). */
export const OBJETIVOS_MODELO: readonly ObjetivoModelo[] = [
  'parada_imprevista',
  'merma_sobre_estandar',
  'minutos_imprevistos',
  'causa_dominante',
] as const;

/** Objetivos binarios: los únicos con PR-AUC, ROC-AUC, Brier y matriz de confusión. */
export const OBJETIVOS_CLASIFICACION: readonly ObjetivoModelo[] = [
  'parada_imprevista',
  'merma_sobre_estandar',
] as const;

/**
 * `modelo_version` (Postgres) sólo se escribe para este objetivo: es el único
 * que consume `/predict` y el que pinta la pestaña Modelo (§5 del contrato:
 * «`/predict` sirve sólo `parada_imprevista`»). Los otros tres objetivos se
 * entrenan y evalúan igual, pero su versión activa vive únicamente en el
 * registro propio de Python (`GET /modelo/versiones`) — Nest no duplica esa
 * tabla para objetivos que ninguna pantalla consume todavía.
 */
export const OBJETIVO_PERSISTIDO: ObjetivoModelo = 'parada_imprevista';

/** Guardarraíl §7.3: por debajo de este ROC-AUC el candidato no se promueve nunca. */
export const AUC_MINIMA = 0.55;

/** Mínimo de muestras `anticipado` para intentar entrenar (coincide con el 422 de Python). */
export const MIN_MUESTRAS = 200;

/** Mejora mínima de PR-AUC (0–1) para desbancar al campeón. */
export const DELTA_PR_AUC_MINIMO = 0.01;

/** Empeoramiento máximo tolerado de Brier del candidato frente al campeón (más bajo es mejor). */
export const BRIER_MAX_EMPEORAMIENTO = 0.005;

/** Empeoramiento máximo tolerado de recall (0–1) del candidato frente al campeón. */
export const RECALL_MAX_EMPEORAMIENTO = 0.03;

/** Casos mínimos de cada clase en la prueba para que la comparación sea fiable. */
export const MIN_POSITIVOS_PRUEBA = 30;
export const MIN_NEGATIVOS_PRUEBA = 30;

/** `GET /salud` corta aquí: si Python no responde a tiempo, no hay entrenamiento (§1, R4). */
export const SALUD_TIMEOUT_MS = 3_000;

/** Timeout por defecto de `POST /entrenar`, coincide con `PREDICTION_TRAIN_TIMEOUT_MS`. */
export const ENTRENAR_TIMEOUT_MS_DEFECTO = 600_000;

/** Una fila `entrenando` más vieja que esto se considera huérfana (proceso caído a medio entrenar). */
export const HUERFANA_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * Clave numérica fija de `pg_try_advisory_lock`/`pg_advisory_unlock` para
 * serializar entrenamientos entre réplicas de la API. Arbitraria pero estable:
 * cambiarla libera cualquier lock preexistente.
 */
export const LOCK_ENTRENAMIENTO_CONTINUO = 727_364;

/** Semilla fija: dos corridas sobre el mismo snapshot piden el mismo entrenamiento a Python. */
export const SEMILLA_ENTRENAMIENTO = 42;

/**
 * `ENTRENAMIENTO_ACTIVO` es opt-in (a diferencia de `INFERENCIA_ACTIVA`, que es
 * opt-out): lanzar un entrenamiento contra Python es una operación pesada
 * (hasta 600 s) que además reescribe `modelo_version`, así que el cron sólo
 * corre si alguien lo pide explícitamente. Nunca corre en `NODE_ENV=test`
 * (mismo criterio que `inferenciaActiva()`, R8).
 */
export function entrenamientoContinuoActivo(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  return process.env.ENTRENAMIENTO_ACTIVO === 'true';
}

/** Expresión cron por defecto: lunes 03:00 (fuera del turno, una vez por semana). */
export const ENTRENAMIENTO_CRON_DEFECTO = '0 3 * * 1';
