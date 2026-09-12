/**
 * Regresión logística con regularización L2, entrenada por descenso de gradiente
 * por lotes. TypeScript puro, sin Nest ni dependencias: se puede probar sola y
 * los pesos caben en un `simple-json` de `modelo_version`.
 *
 * Por qué este modelo y no un gradient boosting (§5.1 del plan de IA): con
 * pocos cientos de muestras y ~35 features un GBM sobreajusta sin aportar, y
 * además los coeficientes estandarizados alimentan directamente la importancia
 * de variables y los factores de la alerta que la UI ya pinta.
 *
 * El entrenamiento es **determinista**: los pesos arrancan en cero y no hay
 * barajado, así que dos corridas sobre el mismo dataset dan el mismo modelo.
 */

export interface OpcionesEntrenamiento {
  /** Iteraciones de descenso de gradiente. */
  iteraciones?: number;
  /** Tasa de aprendizaje inicial (decae 1/(1+0,001·t)). */
  tasaAprendizaje?: number;
  /** Fuerza de la penalización L2; no penaliza el sesgo. */
  lambdaL2?: number;
  /** Pondera cada clase por el inverso de su frecuencia (clases desbalanceadas). */
  ponderarClases?: boolean;
  /** Corta antes si la mejora de la pérdida cae por debajo de este valor. */
  tolerancia?: number;
}

export interface ModeloLogistico {
  nombres: string[];
  pesos: number[];
  sesgo: number;
  /** Media de cada columna en el entrenamiento (estandarización z). */
  medias: number[];
  /** Desviación típica de cada columna; nunca 0 (se sustituye por 1). */
  desviaciones: number[];
  lambdaL2: number;
  iteraciones: number;
}

const OPCIONES: Required<OpcionesEntrenamiento> = {
  iteraciones: 600,
  tasaAprendizaje: 0.35,
  lambdaL2: 1,
  ponderarClases: true,
  tolerancia: 1e-7,
};

export function sigmoide(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function estandarizacion(X: number[][]): { medias: number[]; desviaciones: number[] } {
  const columnas = X[0]?.length ?? 0;
  const medias = new Array<number>(columnas).fill(0);
  const desviaciones = new Array<number>(columnas).fill(1);
  if (!X.length) return { medias, desviaciones };
  for (let j = 0; j < columnas; j += 1) {
    let suma = 0;
    for (const fila of X) suma += fila[j] ?? 0;
    const media = suma / X.length;
    let varianza = 0;
    for (const fila of X) varianza += ((fila[j] ?? 0) - media) ** 2;
    medias[j] = media;
    const sd = Math.sqrt(varianza / X.length);
    /* Una columna constante (p. ej. el one-hot de una línea sin muestras en el
     * pliegue) quedaría con desviación 0: se deja en 1 para no dividir por cero,
     * con lo que su z es 0 y el coeficiente no puede influir. */
    desviaciones[j] = sd > 1e-9 ? sd : 1;
  }
  return { medias, desviaciones };
}

function estandarizar(x: readonly number[], medias: number[], desviaciones: number[]): number[] {
  return medias.map((m, j) => ((x[j] ?? 0) - m) / desviaciones[j]!);
}

/** Entrena sobre `X` (filas × features) e `y` (0/1) y devuelve el modelo serializable. */
export function entrenarLogistica(
  X: number[][],
  y: number[],
  nombres: string[],
  opciones: OpcionesEntrenamiento = {},
): ModeloLogistico {
  const cfg = { ...OPCIONES, ...opciones };
  const n = X.length;
  const d = nombres.length;
  const { medias, desviaciones } = estandarizacion(X);
  const Z = X.map((fila) => estandarizar(fila, medias, desviaciones));

  const positivos = y.reduce((a, v) => a + v, 0);
  const negativos = n - positivos;
  const pesoPos = cfg.ponderarClases && positivos > 0 ? n / (2 * positivos) : 1;
  const pesoNeg = cfg.ponderarClases && negativos > 0 ? n / (2 * negativos) : 1;

  const pesos = new Array<number>(d).fill(0);
  let sesgo = 0;
  let perdidaPrevia = Number.POSITIVE_INFINITY;

  for (let t = 0; t < cfg.iteraciones; t += 1) {
    const gradiente = new Array<number>(d).fill(0);
    let gradienteSesgo = 0;
    let perdida = 0;
    let pesoTotal = 0;

    for (let i = 0; i < n; i += 1) {
      const fila = Z[i]!;
      let z = sesgo;
      for (let j = 0; j < d; j += 1) z += pesos[j]! * fila[j]!;
      const p = sigmoide(z);
      const objetivo = y[i]!;
      const w = objetivo === 1 ? pesoPos : pesoNeg;
      const error = (p - objetivo) * w;
      for (let j = 0; j < d; j += 1) gradiente[j]! += error * fila[j]!;
      gradienteSesgo += error;
      const eps = 1e-12;
      perdida += -w * (objetivo * Math.log(p + eps) + (1 - objetivo) * Math.log(1 - p + eps));
      pesoTotal += w;
    }

    const escala = pesoTotal > 0 ? 1 / pesoTotal : 0;
    const tasa = cfg.tasaAprendizaje / (1 + 0.001 * t);
    /* La L2 se aplica al coeficiente, no al sesgo: penalizar el intercepto
     * sesgaría la probabilidad base hacia 0,5 sin ganar generalización. El
     * encogimiento va como factor multiplicativo acotado en [0, 1] y no como
     * resta, para que una lambda grande sature en «peso 0» en vez de divergir. */
    const encogimiento = Math.max(0, 1 - (tasa * cfg.lambdaL2) / Math.max(1, n));
    for (let j = 0; j < d; j += 1) {
      pesos[j]! = pesos[j]! * encogimiento - tasa * gradiente[j]! * escala;
    }
    sesgo -= tasa * gradienteSesgo * escala;

    const perdidaMedia = perdida * escala;
    if (Math.abs(perdidaPrevia - perdidaMedia) < cfg.tolerancia) break;
    perdidaPrevia = perdidaMedia;
  }

  return { nombres, pesos, sesgo, medias, desviaciones, lambdaL2: cfg.lambdaL2, iteraciones: cfg.iteraciones };
}

/** Probabilidad 0–1 de la clase positiva para un vector en el orden de `nombres`. */
export function predecirProba(modelo: ModeloLogistico, x: readonly number[]): number {
  const z = estandarizar(x, modelo.medias, modelo.desviaciones);
  let acumulado = modelo.sesgo;
  for (let j = 0; j < modelo.pesos.length; j += 1) acumulado += modelo.pesos[j]! * z[j]!;
  return sigmoide(acumulado);
}

export function predecirLote(modelo: ModeloLogistico, X: number[][]): number[] {
  return X.map((fila) => predecirProba(modelo, fila));
}

/**
 * Importancia relativa 0–100 de cada feature: |coeficiente estandarizado|
 * normalizado por el máximo. Al estar todas las columnas en unidades z los
 * coeficientes son comparables entre sí.
 */
export function importanciaRelativa(modelo: ModeloLogistico): { nombre: string; importancia: number }[] {
  const maximo = Math.max(1e-9, ...modelo.pesos.map((p) => Math.abs(p)));
  return modelo.nombres
    .map((nombre, j) => ({
      nombre,
      importancia: Math.round((Math.abs(modelo.pesos[j] ?? 0) / maximo) * 100),
    }))
    .sort((a, b) => b.importancia - a.importancia);
}

/**
 * Contribución de cada feature a la puntuación de una muestra concreta
 * (`coef_j × z_j`). Es lo que la UI pinta como «factores» del detalle de alerta.
 */
export function contribuciones(
  modelo: ModeloLogistico,
  x: readonly number[],
): { nombre: string; contribucion: number }[] {
  const z = estandarizar(x, modelo.medias, modelo.desviaciones);
  return modelo.nombres
    .map((nombre, j) => ({ nombre, contribucion: (modelo.pesos[j] ?? 0) * (z[j] ?? 0) }))
    .sort((a, b) => b.contribucion - a.contribucion);
}
