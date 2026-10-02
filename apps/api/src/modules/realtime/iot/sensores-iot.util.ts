import type { EstadoSensoresIot, SensoresLinea } from '@mes/types';
import { ahoraIso } from '../../../common/utils/query';

/**
 * Aritmética pura de la integración con el servicio IoT (`iot-yambo`): sin red,
 * sin reloj (el `ahora` se inyecta) y sin Nest, para poder probarla aislada.
 *
 * Todo sale de LECTURAS (`GET`): el producido de la orden es el conteo de la
 * lineal en [inicio de la orden, ahora] que calcula el propio IoT
 * (`GET /api/lineales/:x/conteo`); la velocidad y la salud de los sensores,
 * del estado vivo (`GET /api/lineales/estado`), con la misma ventana de gracia
 * que el panel TV del legado (`yamboli-back/src/utils/panel-tv-hub.ts`).
 */

/* ------------------------------------------------------------------ */
/* Contrato de la API IoT (`GET /api/lineales*`)                       */
/* ------------------------------------------------------------------ */

export interface LinealIot {
  id: number;
  nombre: string;
  sensores: string[];
}

export interface EstadoSensorIot {
  linea_id: string;
  /** Acumulado del servidor (monótono). */
  server_total: number;
  /** LWT de MQTT: parpadea con cada microcorte de WiFi del ESP32. */
  online: boolean;
  state: number | null;
  last_count_at_utc: string | null;
  last_seen_at: string | null;
  /** `false` si está asignado pero nunca escribió. */
  reportado: boolean;
  velocidad_uph?: number | null;
}

export interface EstadoLinealIot {
  id: number;
  nombre: string;
  server_total: number;
  online: boolean;
  last_count_at_utc: string | null;
  /**
   * u/h de la lineal sobre los últimos ~2 min (suma de sus salidas). `null` es
   * SIN DATO —ventana insuficiente o alguna salida sin medir—, nunca "va a 0".
   * Opcional: un IoT anterior a la v2.6 no lo trae.
   */
  velocidad_uph?: number | null;
  sensores: EstadoSensorIot[];
}

/** Conteo de la orden (`GET /api/lineales/:x/conteo?desde&hasta`). */
export interface ConteoOrdenIot {
  /** Unidades en el rango; `null` si ningún sensor tenía snapshot previo al inicio. */
  total: number | null;
  /** `true` si algún sensor quedó fuera por no tener snapshot de referencia. */
  parcial: boolean;
  /** Sensores excluidos del total por falta de referencia. */
  sinReferencia: string[];
}

/* ------------------------------------------------------------------ */
/* Sensores en línea                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ventana de gracia del `online` crudo (la misma que el legado). El `online`
 * del IoT es el LWT de MQTT: un microcorte de WiFi lo pone en rojo al instante
 * sin que el sensor haya dejado de contar. 3 min absorben esas reconexiones
 * (segundos) sin esconder una caída real, que se ve por `last_seen_at` y
 * `last_count_at_utc` parados.
 */
export const VENTANA_GRACIA_SENSOR_MS = 3 * 60 * 1000;

/** En línea si el LWT lo dice o si reportó algo dentro de la ventana de gracia. */
export function sensorEnLinea(sensor: EstadoSensorIot, ahoraMs: number): boolean {
  if (sensor.online === true) return true;
  const marcas = [sensor.last_seen_at, sensor.last_count_at_utc]
    .map((iso) => (iso ? Date.parse(iso) : NaN))
    .filter((t) => Number.isFinite(t));
  if (marcas.length === 0) return false;
  return ahoraMs - Math.max(...marcas) < VENTANA_GRACIA_SENSOR_MS;
}

/* ------------------------------------------------------------------ */
/* Mapeo línea MES ↔ lineal IoT                                        */
/* ------------------------------------------------------------------ */

/**
 * Clave de comparación de nombres: el IoT enlaza por nombre exacto con el
 * maestro de Strapi (`MOLDEADORA A3`) y el MES guarda `Moldeadora A3`, así que
 * se compara sin mayúsculas, tildes ni espacios repetidos.
 */
export function normalizarNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Configuración `IOT_LINEAS`:
 * - vacía → `null`: todas las líneas del MES cuyo nombre coincide con una
 *   lineal instrumentada del IoT (como el legado).
 * - `LIN-MOLD-A3,LIN-MOLD-A2` → sólo esas, enlazadas por nombre.
 * - `LIN-MOLD-A3=MOLDEADORA A3` → enlace explícito con otro nombre de lineal.
 *
 * Devuelve `lineaId → nombre de lineal` (`null` = resolver por nombre).
 */
export function parsearMapeoLineas(
  valor: string | undefined | null,
): Map<string, string | null> | null {
  const texto = valor?.trim();
  if (!texto) return null;
  const mapeo = new Map<string, string | null>();
  for (const entrada of texto.split(',')) {
    const [id, ...resto] = entrada.split('=');
    const lineaId = id?.trim();
    if (!lineaId) continue;
    const lineal = resto.join('=').trim();
    mapeo.set(lineaId, lineal || null);
  }
  return mapeo;
}

/**
 * Nombre exacto de la lineal IoT de una línea del MES, o `null` si la línea no
 * está habilitada o no tiene lineal con sensores en el catálogo del IoT.
 */
export function resolverLineal(
  linea: { id: string; nombre: string },
  mapeo: Map<string, string | null> | null,
  catalogo: readonly LinealIot[],
): string | null {
  if (mapeo && !mapeo.has(linea.id)) return null;
  const buscado = normalizarNombre(mapeo?.get(linea.id) ?? linea.nombre);
  const lineal = catalogo.find(
    (l) => l.sensores.length > 0 && normalizarNombre(l.nombre) === buscado,
  );
  return lineal?.nombre ?? null;
}

/* ------------------------------------------------------------------ */
/* Lectura de una línea                                                */
/* ------------------------------------------------------------------ */

export interface LecturaIotLinea {
  sensores: SensoresLinea;
  /** Unidades contadas desde el inicio de la orden; `null` = sin dato fiable. */
  producido: number | null;
  /** u/min medida por el IoT; `null` = sin dato (nunca "va a 0"). */
  velocidadUnidMin: number | null;
}

export interface EntradaLecturaIot {
  lineal: string;
  /** Estado vivo de la lineal; `undefined` si el IoT no la devolvió. */
  vivo: EstadoLinealIot | undefined;
  /** `false` si el IoT no respondió (o la última respuesta buena caducó). */
  consultado: boolean;
  /** `true` si la línea tiene una orden en curso. */
  conOrden: boolean;
  /** Conteo de la orden en curso; `undefined` si el IoT no lo dio (aún o por fallo). */
  conteo: ConteoOrdenIot | undefined;
  /**
   * `true` si el conteo de esta orden es menor que uno ya visto: un contador se
   * reinició (el IoT recorta cada sensor a 0, así que la caída es la única
   * huella) y el número dejó de ser comparable.
   */
  retrocedio?: boolean;
  ahoraMs: number;
}

/**
 * Producido, velocidad y salud de los sensores de una línea instrumentada.
 *
 * El conteo sólo se publica cuando es de fiar; si no, `producido` queda en
 * `null` y `sensores.estado` dice por qué, para que el tablero caiga al
 * registro manual en vez de mostrar un cero que no es tal.
 */
export function calcularLecturaLinea(e: EntradaLecturaIot): LecturaIotLinea {
  const sensoresVivos = e.consultado ? (e.vivo?.sensores ?? []) : [];
  const sensores = sensoresVivos.map((s) => ({
    id: s.linea_id,
    enLinea: sensorEnLinea(s, e.ahoraMs),
  }));
  const enLinea = sensores.filter((s) => s.enLinea).length;
  const ultima = e.consultado ? e.vivo?.last_count_at_utc : null;

  const resumen = (estado: EstadoSensoresIot): SensoresLinea => ({
    lineal: e.lineal,
    consultado: e.consultado,
    total: sensores.length,
    enLinea,
    sensores,
    estado,
    ...(ultima ? { ultimaLectura: ahoraIso(new Date(ultima)) } : {}),
  });

  if (!e.consultado || !e.vivo) {
    return { sensores: resumen('api_caida'), producido: null, velocidadUnidMin: null };
  }

  /* La velocidad no depende del conteo: una orden sin conteo utilizable sigue
   * teniendo ritmo. En una línea sin orden el ritmo no describe nada del
   * tablero (no hay objetivo contra el que medirlo). */
  const uph = e.vivo.velocidad_uph;
  const velocidadUnidMin =
    e.conOrden && typeof uph === 'number' && Number.isFinite(uph) && uph >= 0
      ? Math.round((uph / 60) * 10) / 10
      : null;

  if (!e.conOrden) {
    return { sensores: resumen('sin_orden'), producido: null, velocidadUnidMin: null };
  }
  if (!e.conteo || e.conteo.total === null) {
    return { sensores: resumen('sin_conteo'), producido: null, velocidadUnidMin };
  }
  /* Recortar a 0 o seguir mostrando el número escondería el reinicio. */
  if (e.retrocedio) {
    return { sensores: resumen('inconsistente'), producido: null, velocidadUnidMin };
  }

  /* La lineal está viva si CUALQUIERA de sus sensores lo está: una salida
   * caída de verdad no pinta la línea entera como caída. Con todos caídos el
   * conteo es el último que llegó al IoT. */
  let estado: EstadoSensoresIot = 'ok';
  if (enLinea === 0) estado = 'sensor_offline';
  else if (e.conteo.parcial) estado = 'parcial';

  return { sensores: resumen(estado), producido: e.conteo.total, velocidadUnidMin };
}
