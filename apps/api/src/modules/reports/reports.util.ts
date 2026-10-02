import { ahoraPlanta } from '@mes/shared';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** `2026-08-28` → `28 ago` (etiqueta de los ejes X). */
export function etiquetaFecha(isoFecha: string): string {
  const d = new Date(`${isoFecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/** Normaliza `?lineaId=A&lineaId=B` y `?lineaId=A,B` a `['A','B']`. */
export function toList(valor: string | string[] | undefined): string[] {
  if (valor === undefined) return [];
  const bruto = Array.isArray(valor) ? valor : [valor];
  return bruto
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

/** ISO local `YYYY-MM-DDTHH:mm:ss` (sin desplazamiento UTC). */
export function ahoraIso(fecha: Date = new Date()): string {
  /* Hora de planta explícita (antes, la del proceso: UTC en el despliegue). */
  return ahoraPlanta(fecha);
}

/** `1 048 576` → `1,0 MB`. */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * `true` si `iso` es una fecha de calendario real (`2026-02-30` no lo es).
 * El DTO solo valida el formato; esto valida el calendario.
 */
export function esFechaReal(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/** Días naturales entre dos fechas ISO, ambos inclusive. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Rango máximo que admite un informe o una exportación (5 años). */
export const MAX_DIAS_RANGO = 1830;

/**
 * Valida un rango `desde`–`hasta`: fechas reales, no invertido y no mayor que
 * {@link MAX_DIAS_RANGO}. Devuelve los errores por campo (vacío = válido).
 */
export function erroresDeRango(desde: string, hasta: string): Record<string, string> {
  const errores: Record<string, string> = {};
  if (!esFechaReal(desde)) errores.desde = 'desde no es una fecha válida';
  if (!esFechaReal(hasta)) errores.hasta = 'hasta no es una fecha válida';
  if (Object.keys(errores).length) return errores;
  if (desde > hasta) errores.hasta = 'hasta debe ser igual o posterior a desde';
  else if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) {
    errores.hasta = `El rango no puede superar ${MAX_DIAS_RANGO} días`;
  }
  return errores;
}

/** Suma `dias` (con signo) a una fecha ISO. */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Misma fecha un año antes (29 feb → 28 feb). */
export function restarAnio(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(a - 1, m - 1, d));
  if (fecha.getUTCMonth() !== m - 1) fecha.setUTCDate(0);
  return fecha.toISOString().slice(0, 10);
}
