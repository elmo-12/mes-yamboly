/**
 * Métricas de evaluación del clasificador (§6 del plan de IA). Funciones puras
 * sobre pares `(y, p)`, sin dependencias: las usan tanto `EvaluacionService`
 * como las pruebas unitarias.
 */

export interface MatrizConfusion {
  vp: number;
  fp: number;
  vn: number;
  fn: number;
}

export interface MetricasClasificacion extends MatrizConfusion {
  /** Corte 0–1 con el que se calculó la matriz. */
  umbral: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
  brier: number;
  exactitud: number;
}

export function matrizConfusion(y: readonly number[], p: readonly number[], umbral: number): MatrizConfusion {
  let vp = 0;
  let fp = 0;
  let vn = 0;
  let fn = 0;
  for (let i = 0; i < y.length; i += 1) {
    const predicho = (p[i] ?? 0) >= umbral ? 1 : 0;
    if (y[i] === 1 && predicho === 1) vp += 1;
    else if (y[i] === 0 && predicho === 1) fp += 1;
    else if (y[i] === 0 && predicho === 0) vn += 1;
    else fn += 1;
  }
  return { vp, fp, vn, fn };
}

export function f1Desde(m: MatrizConfusion): number {
  const precision = m.vp + m.fp > 0 ? m.vp / (m.vp + m.fp) : 0;
  const recall = m.vp + m.fn > 0 ? m.vp / (m.vp + m.fn) : 0;
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
}

/**
 * AUC por el estadístico de Mann-Whitney con rangos promediados en los empates
 * (equivale al área bajo la curva ROC y no necesita ordenar umbrales).
 */
export function auc(y: readonly number[], p: readonly number[]): number {
  const positivos = y.filter((v) => v === 1).length;
  const negativos = y.length - positivos;
  if (positivos === 0 || negativos === 0) return 0.5;

  const indices = y.map((_, i) => i).sort((a, b) => (p[a] ?? 0) - (p[b] ?? 0));
  const rangos = new Array<number>(y.length).fill(0);
  let i = 0;
  while (i < indices.length) {
    let j = i;
    while (j + 1 < indices.length && (p[indices[j + 1]!] ?? 0) === (p[indices[i]!] ?? 0)) j += 1;
    const rangoMedio = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) rangos[indices[k]!] = rangoMedio;
    i = j + 1;
  }
  let sumaPositivos = 0;
  for (let k = 0; k < y.length; k += 1) if (y[k] === 1) sumaPositivos += rangos[k]!;
  return (sumaPositivos - (positivos * (positivos + 1)) / 2) / (positivos * negativos);
}

/** Brier score: error cuadrático medio de la probabilidad (0 perfecto, 0,25 azar). */
export function brier(y: readonly number[], p: readonly number[]): number {
  if (!y.length) return 0;
  let suma = 0;
  for (let i = 0; i < y.length; i += 1) suma += ((p[i] ?? 0) - (y[i] ?? 0)) ** 2;
  return suma / y.length;
}

/**
 * Umbral que maximiza F1. No se fija en 0,5 porque con clases desbalanceadas
 * ese corte deja el recall por los suelos (§6.3); se recorre la rejilla de
 * probabilidades observadas para no inventar cortes fuera del soporte.
 */
export function umbralOptimoF1(y: readonly number[], p: readonly number[]): number {
  const candidatos = [...new Set(p.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  let mejor = 0.5;
  let mejorF1 = -1;
  for (const umbral of candidatos.length ? candidatos : [0.5]) {
    const f1 = f1Desde(matrizConfusion(y, p, umbral));
    if (f1 > mejorF1) {
      mejorF1 = f1;
      mejor = umbral;
    }
  }
  return mejor;
}

export function evaluar(y: readonly number[], p: readonly number[], umbral: number): MetricasClasificacion {
  const m = matrizConfusion(y, p, umbral);
  const precision = m.vp + m.fp > 0 ? m.vp / (m.vp + m.fp) : 0;
  const recall = m.vp + m.fn > 0 ? m.vp / (m.vp + m.fn) : 0;
  const total = m.vp + m.fp + m.vn + m.fn;
  return {
    ...m,
    umbral,
    precision,
    recall,
    f1: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0,
    auc: auc(y, p),
    brier: brier(y, p),
    exactitud: total > 0 ? (m.vp + m.vn) / total : 0,
  };
}

/**
 * Lift de las 3 líneas más riesgosas (§6.3): de las que el modelo marca arriba
 * en cada turno, qué proporción para de verdad, dividido por la tasa base. Es
 * la métrica que refleja el uso real del gráfico «Riesgo por línea».
 */
export function liftTopK(
  filas: readonly { clave: string; y: number; p: number }[],
  k = 3,
): number {
  const porTurno = new Map<string, { y: number; p: number }[]>();
  for (const f of filas) {
    const lista = porTurno.get(f.clave);
    if (lista) lista.push(f);
    else porTurno.set(f.clave, [f]);
  }
  let aciertos = 0;
  let seleccionados = 0;
  for (const [, lista] of porTurno) {
    const top = [...lista].sort((a, b) => b.p - a.p).slice(0, k);
    seleccionados += top.length;
    aciertos += top.filter((f) => f.y === 1).length;
  }
  if (!seleccionados) return 0;
  const base = filas.filter((f) => f.y === 1).length / filas.length;
  if (base <= 0) return 0;
  return aciertos / seleccionados / base;
}
