import type { LineaEstado, TiempoRealResumen } from '@mes/types';

/**
 * Contexto operativo que los overlays de captura precargan (spec 04.A:
 * "LLEN-M2 · Llenadora M2 · OF-2026-0815 · Turno Día · Jorge Quispe").
 */
export interface ContextoLinea {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  /** `LLEN-M2 · Llenadora M2` */
  etiqueta: string;
  ordenId?: string;
  ordenCodigo?: string;
  productoNombre?: string;
  turnoLabel: string;
  turnoRango: string;
  velocidad: number;
  /**
   * Estándar **en u/min** congelado en la orden en curso al iniciarla (del par
   * producto × línea). Nunca sale del producto: el mismo producto tiene
   * velocidades distintas según la línea donde se fabrique.
   */
  velocidadEstandar: number;
  producido: number;
  plan: number;
  maquinistaNombre?: string;
  deteccionId?: string;
  deteccionTexto?: string;
  deteccionHora?: string;
}

export function contextoDeLinea(linea: LineaEstado, resumen: TiempoRealResumen): ContextoLinea {
  return {
    lineaId: linea.lineaId,
    lineaCodigo: linea.lineaCodigo,
    lineaNombre: linea.lineaNombre,
    etiqueta: `${linea.lineaCodigo} · ${linea.lineaNombre}`,
    ordenId: linea.orden?.id,
    ordenCodigo: linea.orden?.codigo,
    productoNombre: linea.orden?.productoNombre,
    turnoLabel: resumen.turnoLabel,
    turnoRango: resumen.turnoRango,
    velocidad: linea.velocidad,
    velocidadEstandar: linea.velocidadEstandar,
    producido: linea.producido,
    plan: linea.plan,
    maquinistaNombre: linea.maquinistaNombre,
    deteccionId: linea.deteccion?.id,
    deteccionTexto: linea.deteccion?.texto,
    deteccionHora: linea.deteccion?.detectadaEn.slice(11, 16),
  };
}

/* ------------------------------------------------------------------ */
/* Fechas de planta: siempre en la zona de Lima                         */
/* ------------------------------------------------------------------ */

/**
 * La API guarda `inicio`/`fin` como ISO local de Lima sin zona. Una tablet con
 * otra zona horaria (o un turno noche que cruza la medianoche) no debe mover la
 * hora: todo se calcula con `America/Lima` (UTC−5 fijo, sin horario de verano).
 */
const OFFSET_LIMA_MS = -5 * 60 * 60 * 1000;

/** Tolerancia hacia el futuro, igual que la API (`TOLERANCIA_FUTURO_MIN`). */
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

/** "Ahora" en Lima como ISO local `AAAA-MM-DDTHH:mm:ss`. */
export function ahoraLimaIso(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + OFFSET_LIMA_MS).toISOString().slice(0, 19);
}

/** Milisegundos epoch de un ISO local de Lima (`2026-08-28T14:10:00`). */
export function msDesdeIsoLima(iso: string): number {
  return Date.parse(`${iso.slice(0, 19)}Z`) - OFFSET_LIMA_MS;
}

/** Hora `HH:mm` de "ahora" en Lima — valor por defecto del campo "Hora de inicio". */
export function horaActual(ahora: Date = new Date()): string {
  return ahoraLimaIso(ahora).slice(11, 16);
}

/**
 * `14:02` → ISO local de Lima que espera la API. El día es el de hoy en Lima,
 * salvo que esa hora quede en el futuro: entonces es del día anterior (a las
 * 00:10 del turno noche, "23:50" es la de anoche, no la de mañana).
 */
export function isoDesdeHora(hora: string, ahora: Date = new Date()): string {
  const hhmmss = /^\d{2}:\d{2}$/.test(hora) ? `${hora}:00` : '00:00:00';
  const hoy = ahoraLimaIso(ahora).slice(0, 10);
  const candidato = `${hoy}T${hhmmss}`;
  if (msDesdeIsoLima(candidato) <= ahora.getTime() + TOLERANCIA_FUTURO_MS) return candidato;
  const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${ayer}T${hhmmss}`;
}

/**
 * Cambia solo la hora de un ISO existente conservando su fecha (para editar
 * una parada sin moverla de día).
 */
export function isoConHora(isoOriginal: string, hora: string): string {
  return `${isoOriginal.slice(0, 10)}T${/^\d{2}:\d{2}$/.test(hora) ? `${hora}:00` : isoOriginal.slice(11, 19)}`;
}

/**
 * Normaliza lo que se teclea en un campo decimal: acepta `.` y `,` como
 * separador (se muestra con coma), deja un solo separador y solo dígitos. Si el
 * texto trae un segundo separador se conserva el valor anterior.
 */
export function normalizarDecimal(texto: string, anterior: string, maxLargo = 7): string {
  const unificado = texto.replace(/\./g, ',');
  if ((unificado.match(/,/g) ?? []).length > 1) return anterior;
  return unificado.replace(/[^0-9,]/g, '').slice(0, maxLargo);
}

/** `2,5` → 2.5 · vacío o inválido → 0. */
export function numeroDesdeDecimal(texto: string): number {
  const valor = Number(texto.replace(',', '.'));
  return Number.isFinite(valor) ? valor : 0;
}
