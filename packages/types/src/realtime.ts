import type { Turno } from './common';
import type { DeteccionIoT } from './downtimes';

export const ESTADOS_LINEA = ['produciendo', 'parada', 'sin_orden', 'alerta', 'sugerida'] as const;
export type EstadoLinea = (typeof ESTADOS_LINEA)[number];

export const ESTADO_LINEA_LABEL: Record<EstadoLinea, string> = {
  produciendo: 'Produciendo',
  parada: 'Parada',
  sin_orden: 'Sin orden',
  alerta: 'Alerta',
  sugerida: 'Sugerida',
};

export interface UltimaParadaResumen {
  causaCodigo: string;
  causaNombre: string;
  /** ISO-8601 con hora. */
  inicio: string;
  duracionMin: number;
  enCurso: boolean;
}

export interface AlertaLinea {
  id: string;
  /** Probabilidad 0–100. */
  riesgo: number;
  texto: string;
  /**
   * ISO-8601 local en que se generó la alerta. El timeline de la línea la
   * ubica con esta marca (nunca con el reloj del servidor), de modo que el
   * orden cronológico de los eventos no dependa de la hora de la consulta.
   */
  generadaEn: string;
}

export interface LineaEstado {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  estado: EstadoLinea;
  orden?: {
    id: string;
    codigo: string;
    productoNombre: string;
    turno: Turno;
  };
  producido: number;
  plan: number;
  /** Unidades por minuto. */
  velocidad: number;
  velocidadEstandar: number;
  /** Minutos que la línea lleva en el estado actual. */
  tiempoEnEstadoMin: number;
  ultimaParada?: UltimaParadaResumen;
  alerta?: AlertaLinea;
  deteccion?: DeteccionIoT;
  maquinistaNombre?: string;
}

export interface TiempoRealResumen {
  /** ISO-8601 de la última actualización. */
  actualizadoEn: string;
  /**
   * `YYYY-MM-DD` que el módulo de tiempo real trata como "hoy" al elegir la
   * orden vigente de cada línea. Con datos de demostración congelados en una
   * fecha fija no coincide con el reloj del navegador, así que las vistas que
   * acotan "lo del turno" (panel del maquinista) deben usar este valor y no
   * `new Date()`.
   */
  diaOperativo: string;
  turno: Turno;
  turnoLabel: string;
  /** `06:00–14:00` */
  turnoRango: string;
  sedeId: string;
  lineas: LineaEstado[];
}

/* ------------------------------------------------------------------ */
/* Timeline del drawer de línea (spec 03.E)                            */
/* ------------------------------------------------------------------ */

export const TIPOS_EVENTO_TIMELINE = ['inicio_of', 'parada', 'velocidad', 'merma', 'fin_of', 'alerta'] as const;
export type TipoEventoTimeline = (typeof TIPOS_EVENTO_TIMELINE)[number];

export interface TimelineEvento {
  id: string;
  /** `HH:mm` */
  hora: string;
  tipo: TipoEventoTimeline;
  titulo: string;
  detalle: string;
  duracionMin?: number;
}

export interface LineaTimeline {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  ordenCodigo?: string;
  eventos: TimelineEvento[];
}

/* ------------------------------------------------------------------ */
/* Modo TV (spec 03.C)                                                 */
/* ------------------------------------------------------------------ */

export interface TvRow {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  estado: EstadoLinea;
  estadoLabel: string;
  producido: number;
  plan: number;
  avancePct: number;
  velocidad: number;
  velocidadEstandar: number;
  tiempoEnEstadoMin: number;
  detalle?: string;
}

export interface TvResumen {
  actualizadoEn: string;
  turnoLabel: string;
  filas: TvRow[];
}

/** Evento emitido por `GET /tiempo-real/stream` (SSE). */
export interface RealtimeStreamEvent {
  tipo: 'estado' | 'alerta' | 'deteccion';
  emitidoEn: string;
  payload: TiempoRealResumen | AlertaLinea | DeteccionIoT;
}
