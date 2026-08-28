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
