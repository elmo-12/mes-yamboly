import { Column, Entity, PrimaryColumn } from 'typeorm';

export type EstadoModelo = 'vigente' | 'archivada' | 'entrenando';

/**
 * Objetivo que predice la versión (§6.4 del plan de IA, §5 del contrato Python).
 * `parada_imprevista` y `merma_sobre_estandar` son binarios; `minutos_imprevistos`
 * es regresión; `causa_dominante` es multiclase. Sólo `parada_imprevista` se
 * persiste en esta tabla (`OBJETIVO_PERSISTIDO`): es el único que consume
 * `/predict`.
 */
export type ObjetivoModelo =
  | 'parada_imprevista'
  | 'merma_sobre_estandar'
  | 'minutos_imprevistos'
  | 'causa_dominante';

/** Nivel de la cascada que produjo los pesos (§5.2 del plan de IA). */
export type ProveedorModelo = 'local-logistica' | 'python-gbm';

/**
 * Pesos serializados de la regresión logística. Se guardan junto con la
 * estandarización usada al entrenar: sin medias y desviaciones los coeficientes
 * no se pueden aplicar a una muestra nueva.
 */
export interface CoeficientesModelo {
  nombres: string[];
  pesos: number[];
  sesgo: number;
  medias: number[];
  desviaciones: number[];
  lambdaL2: number;
  iteraciones: number;
}

/** Perfil del corpus con el que se entrenó (fase 2 de CRISP-DM). */
export interface PerfilDatos {
  ordenes: number;
  paradas: number;
  mermas: number;
  lineas: number;
  desde: string;
  hasta: string;
  muestras: number;
  tasaPositivos: number;
  /** Regla con la que se binarizó el target y su umbral en minutos. */
  reglaTarget: 'parada_individual' | 'minutos_sobre_mediana';
  umbralMinutos: number;
  pctParadasSinCategorizar: number;
  /** Catálogo de causas raíz vigente al entrenar (R7: drift del árbol). */
  tiposCausa: string[];
  columnasConNulos: Record<string, number>;
}

/** Versión del modelo predictivo y sus métricas de evaluación (spec 08.D). */
@Entity('modelo_version')
export class ModeloVersion {
  @PrimaryColumn('text')
  version!: string;

  @Column('text')
  entrenadoEn!: string;

  @Column('integer', { default: 0 })
  eventos!: number;

  @Column('double precision', { default: 0 })
  auc!: number;

  @Column('double precision', { default: 0 })
  f1!: number;

  @Column('double precision', { default: 0 })
  precision!: number;

  @Column('double precision', { default: 0 })
  recall!: number;

  @Column('integer', { default: 0 })
  features!: number;

  /** Alertas emitidas por esta versión en los últimos 30 días. */
  @Column('integer', { default: 0 })
  alertas30d!: number;

  /**
   * `pendiente` hasta el primer entrenamiento real: el default anterior
   * (`Gradient Boosting (scikit-learn)`) venía de la maqueta y mentía sobre lo
   * que corría de verdad (regresión logística en TS) antes de este bloque.
   */
  @Column('text', { default: 'pendiente' })
  algoritmo!: string;

  @Column('text', { default: 'archivada' })
  estado!: EstadoModelo;

  @Column('integer', { default: 0 })
  orden!: number;

  /* --- Modelo real entrenado sobre el feature store (plan de IA §6.4) --- */

  @Column('text', { default: 'parada_imprevista' })
  objetivo!: ObjetivoModelo;

  @Column('text', { default: 'local-logistica' })
  proveedor!: ProveedorModelo;

  /** Pesos + estandarización; `null` mientras la versión se está entrenando. */
  @Column('simple-json', { nullable: true })
  coeficientes!: CoeficientesModelo | null;

  /**
   * Corte de decisión 0–100 que maximiza F1 en la validación temporal. No es
   * 0,5: se reporta como sugerencia frente a `umbrales.probabilidadMinima`, que
   * sigue siendo el que gobierna la creación de alertas.
   */
  @Column('double precision', { default: 50 })
  umbralDecision!: number;

  /* Matriz de confusión de la validación walk-forward. */
  @Column('integer', { default: 0 })
  vp!: number;

  @Column('integer', { default: 0 })
  fp!: number;

  @Column('integer', { default: 0 })
  vn!: number;

  @Column('integer', { default: 0 })
  fn!: number;

  /** Brier score (0 perfecto, 0,25 = moneda al aire): calidad de la calibración. */
  @Column('double precision', { default: 0 })
  brier!: number;

  /** Lift de las 3 líneas más riesgosas frente a la tasa base de positivos. */
  @Column('double precision', { default: 0 })
  liftTop3!: number;

  /** AUC del corte temporal único (70/30 por días), sin promediar pliegues. */
  @Column('double precision', { default: 0 })
  aucPrueba!: number;

  /**
   * AUC del mismo modelo entrenado con las muestras `retro`, que ven el propio
   * turno. No es desplegable —sería fuga de datos— pero marca el techo al que
   * podría aspirar el modelo anticipado, y la distancia entre ambos es un
   * resultado en sí mismo para la tesis.
   */
  @Column('double precision', { default: 0 })
  aucRetro!: number;

  /** Última fecha del tramo de entrenamiento del corte temporal. */
  @Column('text', { nullable: true })
  corteEntrenamiento!: string | null;

  /** Última fecha del tramo de prueba del corte temporal. */
  @Column('text', { nullable: true })
  cortePrueba!: string | null;

  /** Importancia agrupada de las variables → `VariableEntrada[]` de la UI. */
  @Column('simple-json', { default: '[]' })
  importancias!: { id: string; nombre: string; importancia: number }[];

  /** Salida de la fase 2 de CRISP-DM; `null` en versiones heredadas. */
  @Column('simple-json', { nullable: true })
  perfilDatos!: PerfilDatos | null;

  /** Mensaje del fallo cuando `estado = 'entrenando'` acabó en error. */
  @Column('text', { nullable: true })
  error!: string | null;

  /* --- Aditivas · orquestador de entrenamiento continuo (bloque B) --- */

  /** PR-AUC (0–1): métrica primaria del walk-forward (clases desbalanceadas). */
  @Column('double precision', { nullable: true })
  prAuc!: number | null;

  /** MAE del objetivo de regresión (`minutos_imprevistos`); `null` para los demás. */
  @Column('double precision', { nullable: true })
  mae!: number | null;

  @Column('double precision', { nullable: true })
  rmse!: number | null;

  @Column('double precision', { nullable: true })
  r2!: number | null;

  /** F1-macro del objetivo multiclase (`causa_dominante`); `null` para los demás. */
  @Column('double precision', { nullable: true })
  f1Macro!: number | null;

  @Column('double precision', { nullable: true })
  accuracy!: number | null;

  /** Hiperparámetros que devolvió Python para el algoritmo ganador. */
  @Column('simple-json', { nullable: true })
  hiperparametros!: Record<string, unknown> | null;

  /** URI del `.joblib` en el volumen de Python (no lo sirve Nest, sólo lo referencia). */
  @Column('text', { nullable: true })
  artefactoUri!: string | null;

  @Column('text', { nullable: true })
  artefactoSha256!: string | null;

  /** SHA-256 del snapshot de `muestra_analitica` con el que se entrenó esta versión. */
  @Column('text', { nullable: true })
  snapshotSha256!: string | null;

  /** Notas de calibración (Platt) que devuelve Python; texto libre, sin parsear. */
  @Column('text', { nullable: true })
  calibracion!: string | null;

  /** `true` si esta corrida desbancó al campeón anterior; `false` si el incumbente ganó. */
  @Column('boolean', { nullable: true })
  promovida!: boolean | null;

  /** Motivo legible de la decisión champion/challenger (se repite en `ReentrenamientoJob.mensaje`). */
  @Column('text', { nullable: true })
  razonPromocion!: string | null;

  /** Cuándo arrancó el entrenamiento (no cuándo se guardó la fila): ancla del huérfano de 2 h. */
  @Column('text', { nullable: true })
  iniciadoEn!: string | null;

  /** Cuándo Python reevaluó al campeón anterior sobre este mismo snapshot. */
  @Column('text', { nullable: true })
  reevaluadoEn!: string | null;
}
