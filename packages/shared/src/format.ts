/**
 * Formateadores es-PE del MES.
 * Convenciones de la tesis: coma decimal, espacio fino de miles ("1 248")
 * y espacio duro antes de la unidad ("78,4 %", "1,4 min").
 */

/** Espacio fino sin salto — separador de miles. */
export const THIN_SPACE = '\u202F';
/** Espacio duro — antes de la unidad. */
export const NBSP = '\u00A0';

export const LOCALE = 'es-PE';

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const DIAS_LARGOS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  // Fechas planas `YYYY-MM-DD` se interpretan como local, no UTC.
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return soloFecha ? new Date(`${value}T00:00:00`) : new Date(value);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `1248` → `1 248` · `1248.5, 1` → `1 248,5` */
export function formatNumber(value: number, decimales = 0): string {
  if (!Number.isFinite(value)) return '—';
  const negativo = value < 0;
  const abs = Math.abs(value);
  const fijo = abs.toFixed(decimales);
  const [enteroRaw, decimalRaw] = fijo.split('.');
  const entero = (enteroRaw ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  const texto = decimalRaw ? `${entero},${decimalRaw}` : entero;
  return negativo ? `−${texto}` : texto;
}

/** `78.4` → `78,4 %` */
export function formatPct(value: number, decimales = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value, decimales)}${NBSP}%`;
}

/** `2.1` → `+2,1 pp` (para deltas de KPI) */
export function formatDelta(value: number, unidad = 'pp', decimales = 1): string {
  if (!Number.isFinite(value)) return '—';
  const signo = value > 0 ? '+' : '';
  return `${signo}${formatNumber(value, decimales)}${NBSP}${unidad}`;
}

/** `1.4` → `1,4 min` */
export function formatMinutes(value: number, decimales = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value, decimales)}${NBSP}min`;
}

/** `1112` (segundos) → `00:18:32` */
export function formatDuration(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '00:00:00';
  const total = Math.floor(segundos);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** `42` → `42 min` · `95` → `1 h 35 min` */
export function formatDurationMin(minutos: number): string {
  if (!Number.isFinite(minutos)) return '—';
  const total = Math.round(minutos);
  if (total < 60) return `${formatNumber(total)}${NBSP}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${pad2(m)}${NBSP}min`;
}

/** `2026-08-28` → `28 ago 2026` */
export function formatDate(value: Date | string | number): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `2026-08-28` → `Viernes 28 ago 2026` */
export function formatDateLong(value: Date | string | number): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${DIAS_LARGOS[d.getDay()]} ${formatDate(d)}`;
}

/** `2026-08-28T14:02:41` → `14:02` (o `14:02:41` con segundos) */
export function formatTime(value: Date | string | number, conSegundos = false): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  const base = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return conSegundos ? `${base}:${pad2(d.getSeconds())}` : base;
}

/** `28 ago 2026 · 14:02` */
export function formatDateTime(value: Date | string | number): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(d)} · ${formatTime(d)}`;
}

/** `3860` → `S/ 3 860` */
export function formatCurrency(value: number, decimales = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `S/${NBSP}${formatNumber(value, decimales)}`;
}

/** `9840, 10000` → `9 840 / 10 000` */
export function formatRatio(actual: number, total: number): string {
  return `${formatNumber(actual)} / ${formatNumber(total)}`;
}

/** `3` → `hace 3 s` · `125` → `hace 2 min` */
export function formatRelative(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return '—';
  if (segundos < 60) return `hace ${Math.round(segundos)}${NBSP}s`;
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)}${NBSP}min`;
  if (segundos < 86400) return `hace ${Math.round(segundos / 3600)}${NBSP}h`;
  return `hace ${Math.round(segundos / 86400)}${NBSP}d`;
}

export function formatKg(value: number, decimales = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value, decimales)}${NBSP}kg`;
}

/** `118` → `118 u/min` */
export function formatSpeed(value: number, decimales = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value, decimales)}${NBSP}u/min`;
}
