import type { EstadoKpi } from '@mes/types';

/**
 * Fórmulas y metas de los 5 KPI de la tesis (Anexos 02–06).
 * Todas devuelven el valor redondeado a 1 decimal.
 */

export const METAS_TESIS = {
  /** Reducción mínima del tiempo de registro frente al pretest. */
  TRI_REDUCCION_PCT: 40,
  /** % mínimo de registros correctos. */
  TCI_PCT: 90,
  /** % mínimo de acuerdo en la encuesta de satisfacción. */
  TSP_PCT: 80,
  /** Funcionalidades a verificar. */
  CFS_TOTAL: 9,
  /** % mínimo de predicciones correctas. */
  EP_PCT: 80,
} as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* TRI — Tiempo de registro de información (Anexo 02)                  */
/* ------------------------------------------------------------------ */

/** TRI = ΣTR / n (minutos por registro). */
export function calcTri(tiemposMin: number[]): number {
  if (tiemposMin.length === 0) return 0;
  const suma = tiemposMin.reduce((acc, t) => acc + t, 0);
  return round1(suma / tiemposMin.length);
}

/** Variación porcentual del postest frente al pretest (negativa = mejora). */
export function calcTriReduccion(pretestMin: number, postestMin: number): number {
  if (pretestMin <= 0) return 0;
  return round1(((postestMin - pretestMin) / pretestMin) * 100);
}

export function estadoTri(reduccionPct: number): EstadoKpi {
  const mejora = -reduccionPct;
  if (mejora >= METAS_TESIS.TRI_REDUCCION_PCT) return 'cumple';
  if (mejora >= METAS_TESIS.TRI_REDUCCION_PCT - 10) return 'en_riesgo';
  return 'no_cumple';
}

/* ------------------------------------------------------------------ */
/* TCI — Tasa de calidad de la información (Anexo 03)                  */
/* ------------------------------------------------------------------ */

/** TCI = RC / RT × 100 (registros correctos sobre registros totales). */
export function calcTci(registrosCorrectos: number, registrosTotales: number): number {
  if (registrosTotales <= 0) return 0;
  return round1((registrosCorrectos / registrosTotales) * 100);
}

/** Un registro es correcto si es completo, preciso, trazable y válido. */
export function esRegistroCorrecto(criterios: {
  completo: boolean;
  preciso: boolean;
  trazable: boolean;
  valido: boolean;
}): boolean {
  return criterios.completo && criterios.preciso && criterios.trazable && criterios.valido;
}

export function estadoTci(pct: number): EstadoKpi {
  if (pct >= METAS_TESIS.TCI_PCT) return 'cumple';
  if (pct >= METAS_TESIS.TCI_PCT - 5) return 'en_riesgo';
  return 'no_cumple';
}

/* ------------------------------------------------------------------ */
/* TSP — Tasa de satisfacción del personal (Anexo 04)                  */
/* ------------------------------------------------------------------ */

/** Promedio Likert 1–5 de una lista de respuestas. */
export function calcPromedioLikert(respuestas: number[]): number {
  if (respuestas.length === 0) return 0;
  const suma = respuestas.reduce((acc, r) => acc + r, 0);
  return Math.round((suma / respuestas.length) * 100) / 100;
}

/** TSP = PO / PT × 100 (respuestas "de acuerdo" 4–5 sobre respuestas totales). */
export function calcTsp(respuestasDeAcuerdo: number, respuestasTotales: number): number {
  if (respuestasTotales <= 0) return 0;
  return round1((respuestasDeAcuerdo / respuestasTotales) * 100);
}

/** Cuenta las respuestas 4 o 5 de una matriz de respuestas Likert. */
export function contarDeAcuerdo(matriz: number[][]): { deAcuerdo: number; total: number } {
  let deAcuerdo = 0;
  let total = 0;
  for (const fila of matriz) {
    for (const valor of fila) {
      total += 1;
      if (valor >= 4) deAcuerdo += 1;
    }
  }
  return { deAcuerdo, total };
}

export function estadoTsp(pct: number): EstadoKpi {
  if (pct >= METAS_TESIS.TSP_PCT) return 'cumple';
  if (pct >= METAS_TESIS.TSP_PCT - 5) return 'en_riesgo';
  return 'no_cumple';
}

/* ------------------------------------------------------------------ */
/* CFS — Cumplimiento funcional del sistema (Anexo 05)                 */
/* ------------------------------------------------------------------ */

/** CFS = FV / FT × 100 (funcionalidades verificadas sobre 9). */
export function calcCfs(funcionalidadesVerificadas: number, total = METAS_TESIS.CFS_TOTAL): number {
  if (total <= 0) return 0;
  return round1((funcionalidadesVerificadas / total) * 100);
}

export function estadoCfs(pct: number): EstadoKpi {
  if (pct >= 100) return 'cumple';
  if (pct >= 80) return 'en_riesgo';
  return 'no_cumple';
}

/* ------------------------------------------------------------------ */
/* EP — Exactitud de las predicciones (Anexo 06)                       */
/* ------------------------------------------------------------------ */

/** EP = PCC / PTG × 100 (predicciones correctas sobre predicciones generadas). */
export function calcEp(prediccionesCorrectas: number, prediccionesTotales: number): number {
  if (prediccionesTotales <= 0) return 0;
  return round1((prediccionesCorrectas / prediccionesTotales) * 100);
}

export function estadoEp(pct: number): EstadoKpi {
  if (pct >= METAS_TESIS.EP_PCT) return 'cumple';
  if (pct >= METAS_TESIS.EP_PCT - 5) return 'en_riesgo';
  return 'no_cumple';
}

/** Segundos → minutos con 1 decimal, unidad de registro del TRI. */
export function segundosAMinutos(segundos: number): number {
  return round1(segundos / 60);
}
