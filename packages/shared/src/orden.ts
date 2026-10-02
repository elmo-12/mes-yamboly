import type { OeeDetalle, Turno } from '@mes/types';
import { computeOee } from './oee';
import { addDays, finDeTurno, toIsoDate, turnoPorHora } from './dates';

/* ------------------------------------------------------------------ */
/* Hora de negocio: America/Lima, explícita                            */
/* ------------------------------------------------------------------ */

/** Zona horaria de la planta. Perú no tiene horario de verano (UTC−5 fijo). */
export const ZONA_PLANTA = 'America/Lima';

const FORMATO_LIMA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_PLANTA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Instante en hora de planta, ISO local sin zona (`2026-10-02T14:05:00`),
 * **independiente de la TZ del proceso**: el despliegue fija `TZ=UTC` y
 * `Date#getHours()` devolvería la hora UTC (+5 h).
 */
export function ahoraPlanta(fecha: Date = new Date()): string {
  const partes = Object.fromEntries(
    FORMATO_LIMA.formatToParts(fecha).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}`;
}

/**
 * Inverso de `ahoraPlanta`: instante absoluto de una hora de pared de planta
 * (`2026-10-02T14:05:00`, sin zona), **independiente de la TZ del proceso**.
 * `new Date(isoLocal)` la leería en la zona del proceso (con `TZ=UTC`, 5 h
 * antes de lo real). Si el texto ya trae zona (`Z`/`±hh:mm`) se respeta.
 * Devuelve `null` si no es una fecha válida.
 */
export function instanteDePlanta(isoLocal: string): Date | null {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(isoLocal)) {
    const ms = Date.parse(isoLocal);
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  /* Se lee como si fuera UTC y se corrige con el desfase de Lima en ese instante. */
  const comoUtc = Date.parse(`${isoLocal}Z`);
  if (Number.isNaN(comoUtc)) return null;
  const pared = Date.parse(`${ahoraPlanta(new Date(comoUtc))}Z`);
  return new Date(comoUtc - (pared - comoUtc));
}

/** Fecha calendario de planta (`YYYY-MM-DD`). */
export function hoyPlanta(fecha: Date = new Date()): string {
  return ahoraPlanta(fecha).slice(0, 10);
}

/** Turno real de un instante de planta (ISO local): 06–18 `D`, resto `N`. */
export function turnoDeInstante(isoLocal: string): Turno {
  return turnoPorHora(Number(isoLocal.slice(11, 13)));
}

/**
 * Fecha operativa de un instante: la del día en que **empezó** su turno. El
 * turno Noche que sigue después de medianoche (00:00–06:00) pertenece al día
 * anterior, como en el sistema legado (`95101743`: fecha 01-oct, inicio 02-oct 01:56).
 */
export function fechaOperativaDe(isoLocal: string): string {
  const fecha = isoLocal.slice(0, 10);
  return Number(isoLocal.slice(11, 13)) < 6 ? toIsoDate(addDays(fecha, -1)) : fecha;
}

/* ------------------------------------------------------------------ */
/* OEE de una orden: una sola fórmula para web y API                   */
/* ------------------------------------------------------------------ */

/**
 * Margen de plausibilidad de la producción declarada: no se aceptan más
 * unidades que `velocidad estándar × duración real × 1,5`. El 50 % de holgura
 * cubre líneas que rinden por encima del estándar del maestro y órdenes que se
 * iniciaron en el MES unos minutos después de arrancar la línea; por encima de
 * eso el dato es un error de tipeo (un cero de más) o una orden mal cerrada.
 */
export const MARGEN_PLAUSIBILIDAD_PRODUCCION = 1.5;

/** Duración mínima (min) que se concede a una orden al juzgar la plausibilidad. */
export const DURACION_MINIMA_PLAUSIBILIDAD_MIN = 1;

function msLocal(iso: string): number {
  /* Ambas marcas son ISO local sin zona: se interpretan igual (UTC) y la resta
   * es exacta sin depender de la TZ del proceso. */
  return Date.parse(`${iso.slice(0, 19)}Z`);
}

/** Minutos (con decimales) entre dos marcas ISO locales; nunca negativo. */
export function minutosEntreLocal(inicio: string, fin: string): number {
  const ms = msLocal(fin) - msLocal(inicio);
  return Number.isFinite(ms) ? Math.max(0, ms / 60_000) : 0;
}

export interface OrdenParaOee {
  inicio: string;
  /** `null` mientras sigue en curso. */
  fin: string | null;
  fecha: string;
  turno: Turno;
}

/**
 * Tiempo planificado de una orden (min) = su duración real `inicio → fin`.
 * Si sigue abierta se mide hasta `ahora`, acotado al cierre de su turno para
 * que una orden olvidada no acumule días.
 */
export function duracionOrdenMin(orden: OrdenParaOee, ahora: string = ahoraPlanta()): number {
  if (orden.fin) return minutosEntreLocal(orden.inicio, orden.fin);
  const tope = finDeTurno(orden.fecha, orden.turno);
  const hasta = ahora < tope ? ahora : tope;
  return minutosEntreLocal(orden.inicio, hasta);
}

export interface EntradaOeeOrden {
  duracionMin: number;
  paradasMin: number;
  producido: number;
  conteoCodificadora: number;
  velocidadEstandar: number;
  /** Merma expresada en unidades (kg ÷ peso del producto), si se puede derivar. */
  mermaUnidades?: number;
}

/**
 * OEE de una orden de fabricación:
 *
 *   tiempo planificado = duración real de la orden (inicio → fin)
 *   Disponibilidad = (planificado − paradas que afectan OEE) / planificado
 *   Desempeño      = producido / (velocidad estándar × tiempo operativo)
 *   Calidad        = unidades buenas / producido, con
 *                    unidades buenas = min(producido, conteo codificadora)
 *   Un conteo 0 o nulo significa «sin codificadora»: unidades buenas =
 *   producido − merma en unidades (si se conoce) o, si no, producido. Nunca 0.
 *
 * La usan el estimado del modal de cierre (web) y el recálculo del servidor.
 */
export function oeeDeOrden(entrada: EntradaOeeOrden): OeeDetalle {
  const { producido, conteoCodificadora, mermaUnidades } = entrada;
  const sinCodificadora = !(conteoCodificadora > 0);
  const unidadesBuenas =
    sinCodificadora
      ? Math.max(0, producido - Math.max(0, mermaUnidades ?? 0))
      : Math.min(producido, conteoCodificadora);
  return computeOee({
    tiempoPlanificadoMin: entrada.duracionMin,
    paradasMin: entrada.paradasMin,
    unidadesProducidas: producido,
    unidadesBuenas,
    velocidadEstandar: entrada.velocidadEstandar,
  });
}

/** Máximo de unidades creíble para una duración (ver {@link MARGEN_PLAUSIBILIDAD_PRODUCCION}). */
export function produccionMaximaPlausible(velocidadEstandar: number, duracionMin: number): number {
  const minutos = Math.max(DURACION_MINIMA_PLAUSIBILIDAD_MIN, duracionMin);
  return Math.ceil(velocidadEstandar * minutos * MARGEN_PLAUSIBILIDAD_PRODUCCION);
}
