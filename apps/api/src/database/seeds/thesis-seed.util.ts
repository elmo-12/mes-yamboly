/**
 * Utilidades deterministas compartidas por los seeds de los módulos de tesis.
 * Reproducen exactamente los datasets mock de `apps/web/src/mocks/data`
 * (mismo `mulberry32`, mismos offsets) para que API y mock den las mismas cifras.
 */

import { HOY as HOY_SEED } from './data/seed';

export { HOY_SEED as HOY };

export const SEED = 20260828;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generador con estado propio: cada dataset usa su offset. */
export function rng(offset = 0) {
  const next = mulberry32(SEED + offset);
  return {
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    float(min: number, max: number, decimales = 1): number {
      const f = 10 ** decimales;
      return Math.round((min + next() * (max - min)) * f) / f;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Día de referencia de los seeds de tesis. Es la misma fecha congelada que usan
 * los datasets operativos (`data/seed.ts`) y el mock del navegador: si aquí se
 * leyera el reloj real, la API y el mock devolverían fechas distintas para el
 * mismo dato sembrado (alertas, reportes, analítica y pretest del TRI).
 */
export function hoy(): string {
  return HOY_SEED;
}

/** Hoy menos `dias`, en `YYYY-MM-DD`. */
export function fechaMenos(dias: number, base = hoy()): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `('2026-08-28', '07:42')` → `2026-08-28T07:42:00`. */
export function iso(fecha: string, hora: string): string {
  return `${fecha}T${hora.length === 5 ? `${hora}:00` : hora}`;
}

export function pad(n: number, ancho = 2): string {
  return String(n).padStart(ancho, '0');
}

export function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-08-28` → `28 ago`. */
export function etiquetaFecha(isoFecha: string): string {
  const d = new Date(`${isoFecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/**
 * Las 9 líneas reales de Yamboly usadas por los agregados de tesis.
 * `velocidadEstandar` es la capacidad nominal de la línea en u/min (máximo
 * `velocidadUnidMin` de sus pares producto × línea).
 */
export const LINEAS_TESIS = [
  { lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2', velocidadEstandar: 450 },
  { lineaId: 'LIN-EXTR-3', lineaCodigo: 'EXTR-3', lineaNombre: 'Extrusora 3', velocidadEstandar: 260 },
  { lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1', velocidadEstandar: 280.5 },
  { lineaId: 'LIN-LLEN-A2', lineaCodigo: 'LLEN-A2', lineaNombre: 'Llenadora A2', velocidadEstandar: 320 },
  { lineaId: 'LIN-LLEN-M1', lineaCodigo: 'LLEN-M1', lineaNombre: 'Llenadora M1', velocidadEstandar: 45 },
  { lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2', velocidadEstandar: 50 },
  { lineaId: 'LIN-MOLD-A2', lineaCodigo: 'MOLD-A2', lineaNombre: 'Moldeadora A2', velocidadEstandar: 300 },
  { lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3', velocidadEstandar: 350 },
  { lineaId: 'LIN-MOLD-A4', lineaCodigo: 'MOLD-A4', lineaNombre: 'Moldeadora A4', velocidadEstandar: 483.3 },
] as const;

/** Turnos reales: `D` Día 06:00–18:00 y `N` Noche 18:00–06:00. */
export const TURNOS_TESIS = [
  { turno: 'D' as const, turnoLabel: 'Día' },
  { turno: 'N' as const, turnoLabel: 'Noche' },
];
