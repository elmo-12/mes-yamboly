import type { DateRange, Periodo, Turno, TurnoInfo } from '@mes/types';

/** Turnos reales de planta: `D` Día 06:00–18:00 · `N` Noche 18:00–06:00. */
export const TURNOS_DEF: TurnoInfo[] = [
  { codigo: 'D', label: 'Día', inicio: '06:00', fin: '18:00' },
  { codigo: 'N', label: 'Noche', inicio: '18:00', fin: '06:00' },
];

function toDate(value: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return soloFecha ? new Date(`${value}T00:00:00`) : new Date(value);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `Date` → `YYYY-MM-DD` en hora local. */
export function toIsoDate(value: Date | string | number): string {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Turno correspondiente a una hora del día (06–18 `D`, resto `N`). */
export function turnoPorHora(hora: number): Turno {
  return hora >= 6 && hora < 18 ? 'D' : 'N';
}

/** Turno correspondiente a una fecha/hora concreta. */
export function turnoPorFecha(value: Date | string | number): Turno {
  return turnoPorHora(toDate(value).getHours());
}

export function turnoInfo(turno: Turno): TurnoInfo {
  return TURNOS_DEF.find((t) => t.codigo === turno) ?? TURNOS_DEF[0];
}

/** `06:00–18:00` (D) · `18:00–06:00` (N) */
export function turnoRango(turno: Turno): string {
  const info = turnoInfo(turno);
  return `${info.inicio}–${info.fin}`;
}

export function addDays(value: Date | string | number, dias: number): Date {
  const d = toDate(value);
  const out = new Date(d);
  out.setDate(out.getDate() + dias);
  return out;
}

export function diffDays(desde: Date | string, hasta: Date | string): number {
  const a = toDate(desde).getTime();
  const b = toDate(hasta).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Rango de fechas de un periodo del filtro de reportes.
 * `hoy` · `semana` (7 días) · `mes` (30) · `trimestre` (90).
 */
export function rangoPeriodo(periodo: Periodo, referencia: Date | string = new Date()): DateRange {
  const hasta = toDate(referencia);
  const dias: Record<Exclude<Periodo, 'personalizado'>, number> = {
    hoy: 0,
    semana: 6,
    mes: 29,
    trimestre: 89,
  };
  const offset = periodo === 'personalizado' ? 6 : dias[periodo];
  return { desde: toIsoDate(addDays(hasta, -offset)), hasta: toIsoDate(hasta) };
}

/** Rango equivalente inmediatamente anterior (comparativa "periodo anterior"). */
export function rangoAnterior(rango: DateRange): DateRange {
  const largo = diffDays(rango.desde, rango.hasta) + 1;
  return {
    desde: toIsoDate(addDays(rango.desde, -largo)),
    hasta: toIsoDate(addDays(rango.hasta, -largo)),
  };
}

/** Mismo rango del año anterior. */
export function rangoAnioAnterior(rango: DateRange): DateRange {
  const desde = toDate(rango.desde);
  const hasta = toDate(rango.hasta);
  desde.setFullYear(desde.getFullYear() - 1);
  hasta.setFullYear(hasta.getFullYear() - 1);
  return { desde: toIsoDate(desde), hasta: toIsoDate(hasta) };
}

/** `true` si la fecha ISO cae dentro del rango (inclusive). */
export function enRango(fechaIso: string, rango: DateRange): boolean {
  return fechaIso >= rango.desde && fechaIso <= rango.hasta;
}

/** Minutos entre dos marcas de tiempo. */
export function minutosEntre(inicio: Date | string, fin: Date | string): number {
  const a = toDate(inicio).getTime();
  const b = toDate(fin).getTime();
  return Math.max(0, Math.round((b - a) / 60_000));
}

/** Lista de fechas ISO de un rango, para las series de tendencia. */
export function diasDelRango(rango: DateRange): string[] {
  const total = diffDays(rango.desde, rango.hasta);
  const out: string[] = [];
  for (let i = 0; i <= total; i += 1) out.push(toIsoDate(addDays(rango.desde, i)));
  return out;
}

/** Saludo del header del Home según la hora. */
export function saludoPorHora(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
