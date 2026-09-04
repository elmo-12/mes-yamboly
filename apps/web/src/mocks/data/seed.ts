/**
 * Utilidades deterministas para los datasets mock.
 * Nunca se usa `Math.random`: toda variación proviene de `mulberry32`
 * con la semilla fija `SEED`, de modo que dos renders dan los mismos datos.
 */

export const SEED = 20260828;

/** Fecha "hoy" congelada del prototipo: viernes 28 ago 2026. */
export const HOY = '2026-08-28';

/** Marca de tiempo de referencia para "ahora" (14:05 del turno Día 06:00–18:00). */
export const AHORA_ISO = '2026-08-28T14:05:00';

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

/** Generador con estado propio: cada dataset crea el suyo con su offset. */
export function rng(offset = 0) {
  const next = mulberry32(SEED + offset);
  return {
    /** Entero en [min, max]. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** Decimal con `decimales` posiciones en [min, max]. */
    float(min: number, max: number, decimales = 1): number {
      const f = 10 ** decimales;
      return Math.round((min + next() * (max - min)) * f) / f;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)] as T;
    },
    bool(probabilidad = 0.5): boolean {
      return next() < probabilidad;
    },
  };
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** `2026-08-28` menos `dias`. */
export function fechaMenos(dias: number, base = HOY): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `2026-08-28` más `dias`. */
export function fechaMas(dias: number, base = HOY): string {
  return fechaMenos(-dias, base);
}

/** `('2026-08-28', '07:42')` → `2026-08-28T07:42:00`. */
export function iso(fecha: string, hora: string): string {
  const partes = hora.length === 5 ? `${hora}:00` : hora;
  return `${fecha}T${partes}`;
}

/** Minutos transcurridos entre dos ISO. */
export function minutosEntreIso(inicio: string, fin: string): number {
  return Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000));
}

/** Suma minutos a un ISO y devuelve otro ISO local. */
export function sumarMinutos(isoFecha: string, minutos: number): string {
  const d = new Date(isoFecha);
  d.setMinutes(d.getMinutes() + minutos);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}
