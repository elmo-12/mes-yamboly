/**
 * Utilidades deterministas compartidas por los seeds de los módulos de tesis.
 * Reproducen exactamente los datasets mock de `apps/web/src/mocks/data`
 * (mismo `mulberry32`, mismos offsets) para que API y mock den las mismas cifras.
 */

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

/** `YYYY-MM-DD` de hoy en hora local. */
export function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

/** Líneas de producción de Yamboly usadas por los agregados de tesis. */
export const LINEAS_TESIS = [
  { lineaId: 'LIN-01', lineaCodigo: 'L1', lineaNombre: 'Paletas', velocidadEstandar: 95 },
  { lineaId: 'LIN-02', lineaCodigo: 'L2', lineaNombre: 'Conos', velocidadEstandar: 120 },
  { lineaId: 'LIN-03', lineaCodigo: 'L3', lineaNombre: 'Vasos', velocidadEstandar: 110 },
  { lineaId: 'LIN-04', lineaCodigo: 'L4', lineaNombre: 'Sándwich', velocidadEstandar: 80 },
  { lineaId: 'LIN-05', lineaCodigo: 'L5', lineaNombre: 'Bombones', velocidadEstandar: 140 },
] as const;

export const TURNOS_TESIS = [
  { turno: 'M' as const, turnoLabel: 'Mañana' },
  { turno: 'T' as const, turnoLabel: 'Tarde' },
  { turno: 'N' as const, turnoLabel: 'Noche' },
];
