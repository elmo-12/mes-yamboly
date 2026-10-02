import type { Turno } from './common';
import type { HeatmapCelda } from './reports';

export interface ModeloInfo {
  version: string;
  /** ISO `YYYY-MM-DD` */
  entrenadoEn: string;
  eventos: number;
  algoritmo: string;
  activo: boolean;
}

export interface InsightCard {
  id: string;
  /** `warning` | `info` | `success` — controla el color de la Insight card. */
  tono: 'warning' | 'info' | 'success';
  texto: string;
  /** Métrica de apoyo mostrada bajo el texto. */
  soporte: string;
  /**
   * Confianza 0–100 de la regla asociativa que generó el hallazgo.
   * Mientras la UI no la consuma sigue mostrando su propia constante. (aditivo · V5)
   */
  confianza?: number;
}

export interface RiesgoLinea {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  /** Riesgo 0–100 para el próximo turno. */
  riesgo: number;
  turnoObjetivo: Turno;
  causaProbable: string;
  /** Probabilidad 0–100 de que la causa probable sea la que efectivamente pare. (aditivo · V5) */
  probabilidadCausa?: number;
  /** Ventana del turno objetivo (`18:00–06:00`). (aditivo · V5) */
  ventana?: string;
}

export interface PrediccionActiva {
  id: string;
  lineaCodigo: string;
  tipo: string;
  prediccion: string;
  probabilidad: number;
  ventana: string;
  estado: string;
}

export interface AnaliticaResumen {
  modelo: ModeloInfo;
  /** Nº de variables de proceso con las que se entrenó el modelo. (aditivo · V5) */
  variablesModelo?: number;
  kpis: {
    ep: number;
    /** Predicciones confirmadas (Anexo 06). Con 0 la EP aún no se ha medido: la UI muestra «—». */
    epConfirmadas?: number;
    precision: number;
    recall: number;
    alertas30d: number;
    /* Variación frente a la versión anterior del modelo. (aditivos · V5) */
    epDelta?: number;
    precisionDelta?: number;
    recallDelta?: number;
    alertas30dDelta?: number;
  };
  insights: InsightCard[];
  riesgoPorLinea: RiesgoLinea[];
  prediccionesActivas: PrediccionActiva[];
}

/* ------------------------------------------------------------------ */
/* Patrones (spec 08.B)                                                */
/* ------------------------------------------------------------------ */

export interface Recurrencia {
  id: string;
  patron: string;
  /** Nº de ocurrencias en el periodo. */
  frecuencia: number;
  impactoMin: number;
  lineas: string[];
  /** Confianza 0–100. */
  confianza: number;
}

export interface Patrones {
  /** Heatmap causa × turno en minutos. */
  heatmap: HeatmapCelda[];
  recurrencias: Recurrencia[];
  /** Paradas + mermas sobre las que se calcularon los patrones. */
  eventosAnalizados?: number;
}

/* ------------------------------------------------------------------ */
/* Predicciones (spec 08.C)                                            */
/* ------------------------------------------------------------------ */

export interface PrediccionPunto {
  fecha: string;
  etiqueta: string;
  predicho: number;
  real: number;
}

export interface PrediccionHistorico {
  id: string;
  fecha: string;
  lineaCodigo: string;
  tipo: string;
  prediccion: string;
  probabilidad: number;
  eventoReal: string;
  acierto: boolean | null;
}

export interface Predicciones {
  serie: PrediccionPunto[];
  historico: PrediccionHistorico[];
  /** Matriz de confusión del backtest de la versión vigente. (aditivo · V5) */
  matrizConfusion?: MatrizConfusion;
}

/* ------------------------------------------------------------------ */
/* Modelo CRISP-DM (spec 08.D)                                         */
/* ------------------------------------------------------------------ */

export const FASES_CRISP_DM = [
  'comprension_negocio',
  'comprension_datos',
  'preparacion',
  'modelado',
  'evaluacion',
  'despliegue',
] as const;
export type FaseCrispDmId = (typeof FASES_CRISP_DM)[number];

export const ESTADOS_FASE = ['completada', 'en_curso', 'pendiente'] as const;
export type EstadoFase = (typeof ESTADOS_FASE)[number];

export interface FaseCrispDm {
  id: FaseCrispDmId;
  orden: number;
  nombre: string;
  estado: EstadoFase;
  descripcion: string;
  /** Métricas propias de la fase (`Registros 2 140`). */
  metricas: { label: string; valor: string }[];
}

/** Matriz de confusión del conjunto de evaluación temporal. */
export interface MatrizConfusion {
  vp: number;
  fp: number;
  vn: number;
  fn: number;
}

export interface MetricasModelo {
  registros: number;
  features: number;
  algoritmo: string;
  auc: number;
  f1: number;
  /* Matriz de confusión de la validación walk-forward. (aditivos · V5) */
  vp?: number;
  fp?: number;
  vn?: number;
  fn?: number;
  /** Última fecha del tramo de entrenamiento del corte temporal (`YYYY-MM-DD`). (aditivo · V5) */
  corteEntrenamiento?: string;
  /** Última fecha del tramo de prueba del corte temporal (`YYYY-MM-DD`). (aditivo · V5) */
  corteValidacion?: string;
}

export interface VersionModelo {
  version: string;
  entrenadoEn: string;
  eventos: number;
  auc: number;
  f1: number;
  estado: 'vigente' | 'archivada';
}

export interface VariableEntrada {
  id: string;
  nombre: string;
  /** Importancia relativa 0–100. */
  importancia: number;
}

export interface Modelo {
  fasesCrispDm: FaseCrispDm[];
  metricas: MetricasModelo;
  versiones: VersionModelo[];
  variablesEntrada: VariableEntrada[];
  /**
   * Reentrenamiento en curso, si lo hay. La vista `/analitica` lo sondea para
   * mantener el Badge "Entrenando" hasta que la nueva versión queda vigente.
   * (aditivo · V4)
   */
  reentrenamiento?: ReentrenamientoJob;
}

/* ------------------------------------------------------------------ */
/* Estado de datos (spec 08.E)                                         */
/* ------------------------------------------------------------------ */

export interface EstadoDatos {
  suficiente: boolean;
  eventos: number;
  requeridos: number;
  /** Avance 0–100. */
  progresoPct: number;
  /** Estimación textual: `≈ 12 días al ritmo actual`. */
  estimacion: string;
}

export interface ReentrenamientoJob {
  id: string;
  estado: 'encolado' | 'entrenando' | 'listo' | 'error';
  version: string;
  iniciadoEn: string;
  mensaje: string;
}
