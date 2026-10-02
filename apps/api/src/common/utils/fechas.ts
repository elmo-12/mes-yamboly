/**
 * Fechas de captura de planta (`inicio`/`fin` de paradas). Se guardan como ISO
 * local de Lima **sin desplazamiento** (`2026-08-28T14:10:00`), así que aquí se
 * valida el formato estricto y se compara contra la hora de Lima, no la del
 * proceso (el despliegue puede fijar `TZ=UTC`).
 */
import { TOLERANCIA_FUTURO_MIN } from '@mes/types';
import { ahoraPlanta } from '@mes/shared';

/** `AAAA-MM-DDTHH:mm` o `AAAA-MM-DDTHH:mm:ss`, sin zona. */
export const ISO_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export const MENSAJE_ISO_LOCAL = 'Fecha y hora inválidas (formato AAAA-MM-DDTHH:mm:ss)';

/**
 * Normaliza a `AAAA-MM-DDTHH:mm:ss` o devuelve `null` si el texto no es una
 * fecha local válida (formato o calendario: `2026-02-31` no pasa).
 */
export function normalizarIsoLocal(valor: unknown): string | null {
  if (typeof valor !== 'string' || !ISO_LOCAL_REGEX.test(valor)) return null;
  const completo = valor.length === 16 ? `${valor}:00` : valor;
  const [fecha, hora] = completo.split('T') as [string, string];
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const [hh, mm, ss] = hora.split(':').map(Number) as [number, number, number];
  if (hh > 23 || mm > 59 || ss > 59) return null;
  const utc = new Date(Date.UTC(a, m - 1, d, hh, mm, ss));
  if (utc.getUTCFullYear() !== a || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return completo;
}

/** "Ahora" en Lima como ISO local `AAAA-MM-DDTHH:mm:ss` (= `ahoraPlanta` de `@mes/shared`). */
export function ahoraLimaIso(ahora: Date = new Date()): string {
  return ahoraPlanta(ahora);
}

/**
 * Suma `dias` (con signo) a una fecha `AAAA-MM-DD` o a un ISO local sin zona,
 * con aritmética de calendario pura: no pasa por la TZ del proceso (con
 * `new Date('…T00:00:00')` + `setDate` + `ahoraIso` se perdía un día con `TZ=UTC`).
 */
export function sumarDiasLocal(iso: string, dias: number): string {
  const largo = Math.min(iso.length, 19);
  const d = new Date(`${iso.length === 10 ? `${iso}T00:00:00` : iso.slice(0, 19)}Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, largo);
}

/** Minutos (con signo) entre dos ISO locales ya validados. */
export function minutosConSigno(inicio: string, fin: string): number {
  return Math.round((Date.parse(`${fin}Z`) - Date.parse(`${inicio}Z`)) / 60000);
}

/** `true` si `iso` está más de la tolerancia por delante de la hora de planta. */
export function esFuturo(iso: string, ahora: Date = new Date()): boolean {
  const limite = Date.parse(`${ahoraLimaIso(ahora)}Z`) + TOLERANCIA_FUTURO_MIN * 60000;
  return Date.parse(`${iso}Z`) > limite;
}
