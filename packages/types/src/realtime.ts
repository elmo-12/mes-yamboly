import type { TipoAlerta } from './alerts';
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
  /**
   * Qué predice la alerta: la tarjeta rotula el riesgo con este tipo (una
   * alerta de velocidad baja no es un «riesgo de parada»).
   */
  tipo: TipoAlerta;
  /** Probabilidad 0–100 de que ocurra el evento de `tipo`. */
  riesgo: number;
  texto: string;
  /**
   * ISO-8601 local en que se generó la alerta. El timeline de la línea la
   * ubica con esta marca (nunca con el reloj del servidor), de modo que el
   * orden cronológico de los eventos no dependa de la hora de la consulta.
   */
  generadaEn: string;
}

/* ------------------------------------------------------------------ */
/* Sensores IoT de la línea (servicio `iot-yambo`)                     */
/* ------------------------------------------------------------------ */

/**
 * Salud del conteo IoT de una línea instrumentada. Distingue "no hay dato" de
 * "produjo 0", que en pantalla se verían igual:
 *
 * - `ok`             conteo de la orden calculado por el IoT, todos los sensores.
 * - `parcial`        algún sensor no tenía snapshot previo al inicio de la orden
 *                    y quedó fuera del conteo (el número se queda corto).
 * - `sensor_offline` ningún sensor reporta: el número es el último bueno.
 * - `sin_conteo`     el IoT no pudo dar el conteo desde el inicio de la orden.
 * - `inconsistente`  el conteo bajó respecto a uno ya visto (contador reiniciado).
 * - `sin_orden`      la línea no tiene orden en curso: sólo se informan sensores.
 * - `api_caida`      el servicio IoT no respondió.
 */
export const ESTADOS_SENSORES_IOT = [
  'ok',
  'parcial',
  'sensor_offline',
  'sin_conteo',
  'inconsistente',
  'sin_orden',
  'api_caida',
] as const;
export type EstadoSensoresIot = (typeof ESTADOS_SENSORES_IOT)[number];

export interface SensorIot {
  /** Identificador del sensor en el IoT (`L21_E`). */
  id: string;
  /** En línea con la ventana de gracia (no parpadea con los microcortes de WiFi). */
  enLinea: boolean;
}

export interface SensoresLinea {
  /** Nombre de la lineal en el servicio IoT (`MOLDEADORA A3`). */
  lineal: string;
  /**
   * `false` si el servicio IoT no respondió en este ciclo: los recuentos
   * quedan a 0 y no deben leerse como "sensores caídos".
   */
  consultado: boolean;
  total: number;
  enLinea: number;
  sensores: SensorIot[];
  estado: EstadoSensoresIot;
  /** ISO-8601 local del último conteo recibido de cualquiera de sus sensores. */
  ultimaLectura?: string;
}

/** Origen de `producido` / `velocidad` en el tablero. */
export type FuenteDatoLinea = 'sensores' | 'manual';

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
  /** Sensores IoT enlazados a la línea; ausente = línea sin sensores. */
  sensores?: SensoresLinea;
  /** `sensores` si `producido` sale del conteo IoT; ausente o `manual` si de los registros. */
  fuenteProduccion?: FuenteDatoLinea;
  /** `sensores` si `velocidad` es la medida por el IoT (últimos ~2 min). */
  fuenteVelocidad?: FuenteDatoLinea;
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
