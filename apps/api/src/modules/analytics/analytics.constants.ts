/**
 * Umbrales de negocio y textos de la metodología. Todo lo que antes vivía aquí
 * como *salida del modelo* (`INSIGHTS`, `RIESGO_POR_LINEA`, `RECURRENCIAS`,
 * `VARIABLES_ENTRADA`, `EVENTOS_MIGRADOS`) se eliminó: esas cifras las calcula
 * ahora el pipeline sobre `orden_fabricacion`, `parada` y `merma`.
 */

/** Volumen mínimo de eventos para reentrenar con garantías (spec 08.E). */
export const EVENTOS_REQUERIDOS = 2000;

/** Ritmo diario de respaldo cuando aún no hay 7 días con los que promediar. */
export const RITMO_DIARIO_EVENTOS = 63;

/**
 * Valores del interruptor de demo `?estado=` de `/analitica/estado-datos`.
 * No intervienen en el cálculo real: sólo fuerzan la variante que se quiere
 * enseñar en una demo o verificar en QA, y son los mismos que usan los mocks
 * msw para que la web offline y la API cuenten lo mismo.
 */
export const EXCEDENTE_DEMO = 140;
export const EVENTOS_DEMO_INSUFICIENTES = 1250;

/**
 * Descripciones de las 6 fases CRISP-DM (spec 08.D). El texto describe lo que
 * el pipeline hace de verdad; el `estado` y las métricas de cada fase los deriva
 * `AnalyticsService.modelo()` de hechos de la base, no de este arreglo.
 */
export const FASES_DESCRIPCION = [
  {
    id: 'comprension_negocio' as const,
    nombre: 'Comprensión del negocio',
    descripcion:
      'Objetivo: anticipar paradas imprevistas que afectan al OEE en las 9 líneas para que el supervisor intervenga antes del turno.',
    metricas: [
      { label: 'Objetivos', valor: '3' },
      { label: 'RF cubiertos', valor: 'RF8, RF9' },
    ],
  },
  {
    id: 'comprension_datos' as const,
    nombre: 'Comprensión de los datos',
    descripcion:
      'Perfilado del corpus sincronizado: órdenes, paradas, mermas y velocidades, con su tasa de positivos y sus nulos.',
    metricas: null,
  },
  {
    id: 'preparacion' as const,
    nombre: 'Preparación de los datos',
    descripcion:
      'Feature store con grano línea × fecha × turno y separación dura entre el modo retrospectivo y el anticipado.',
    metricas: null,
  },
  {
    id: 'modelado' as const,
    nombre: 'Modelado',
    descripcion:
      'LightGBM/HistGB/regresión logística (`services/prediccion-py`) entrenados sobre las muestras anticipadas, con selección del algoritmo ganador por PR-AUC.',
    metricas: null,
  },
  {
    id: 'evaluacion' as const,
    nombre: 'Evaluación',
    descripcion:
      'Validación temporal walk-forward de 5 pliegues, matriz de confusión, PR-AUC/ROC-AUC, Brier y lift@top-3.',
    metricas: null,
  },
  {
    id: 'despliegue' as const,
    nombre: 'Despliegue',
    descripcion:
      'Ciclo de inferencia cada 15 minutos sobre las 9 líneas, conectado al motor de alertas y al backtest diario.',
    metricas: null,
  },
];
