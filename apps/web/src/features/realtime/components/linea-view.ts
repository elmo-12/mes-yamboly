import type { BadgeColor, LineCardProps, LineSegment, LineState } from '@mes/ui';
import type {
  EstadoLinea,
  EstadoSensoresIot,
  LineaEstado,
  TiempoRealResumen,
  TipoAlerta,
} from '@mes/types';
import { TURNO_LABEL } from '@mes/types';
import { formatDelta, formatDurationMin, formatNumber, formatPct, formatTime } from '@mes/shared';

/** `sin_orden` (API) → `sin-orden` (prop `state` de MES / Line card). */
export function estadoLineCard(estado: EstadoLinea): LineState {
  return estado === 'sin_orden' ? 'sin-orden' : estado;
}

/**
 * Timeline de 8 px de la Line card (Figma 2153:238): 4 segmentos en los estados
 * base y 5 en Alerta/Sugerida, con el último tramo del color del estado actual.
 * Lo usa la variante compacta (panel del maquinista); el tablero de Tiempo real
 * muestra la barra de avance del objetivo en su lugar.
 */
const SEGMENTOS: Record<EstadoLinea, readonly LineSegment[]> = {
  produciendo: [{ tone: 'ok' }, { tone: 'micro' }, { tone: 'ok' }, { tone: 'idle' }],
  alerta: [
    { tone: 'ok' },
    { tone: 'micro' },
    { tone: 'ok' },
    { tone: 'micro' },
    { tone: 'idle' },
  ],
  sugerida: [
    { tone: 'ok' },
    { tone: 'micro' },
    { tone: 'ok' },
    { tone: 'unknown' },
    { tone: 'idle' },
  ],
  parada: [{ tone: 'ok' }, { tone: 'micro' }, { tone: 'stop' }, { tone: 'idle' }],
  sin_orden: [{ tone: 'idle' }],
};

/**
 * Reparto de la botonera dentro de la Line card ampliada (contenedor
 * `@container/line-card`). `BOTON_PRINCIPAL`: por debajo de 24rem de tarjeta
 * el Primary ocupa la fila completa y la secundaria + el menú bajan a la
 * siguiente; a partir de ahí los tres comparten una sola fila.
 * `BOTON_FILA`: reparto a partes iguales del ancho que quede.
 */
export const BOTON_PRINCIPAL = 'basis-full @sm/line-card:flex-1 @sm/line-card:basis-0';
export const BOTON_FILA = 'flex-1 basis-0';

/**
 * Rótulo del badge en estado `alerta` según lo que predice la alerta: la
 * probabilidad de una alerta de velocidad no es un «riesgo de parada».
 */
const RIESGO_POR_TIPO: Record<TipoAlerta, string> = {
  parada_prevista: 'Riesgo de parada',
  merma_prevista: 'Riesgo de merma',
  velocidad_baja: 'Riesgo de velocidad baja',
  oee_bajo: 'Riesgo de OEE bajo',
};

export function badgeLinea(linea: LineaEstado): string {
  switch (linea.estado) {
    case 'parada':
      return `En parada · ${formatDurationMin(linea.tiempoEnEstadoMin)}`;
    case 'alerta':
      return linea.alerta
        ? `${RIESGO_POR_TIPO[linea.alerta.tipo] ?? 'Riesgo'} ${formatNumber(linea.alerta.riesgo)} %`
        : 'En riesgo';
    case 'sugerida':
      return 'Parada detectada por sensor';
    case 'sin_orden':
      return 'Sin orden';
    default:
      return 'Produciendo';
  }
}

/** Fila de la orden: OF + producto, o el motivo de que la línea esté libre. */
function textoOrden(linea: LineaEstado): string {
  if (!linea.orden) return 'Sin orden asignada · línea disponible';
  return `${linea.orden.codigo} · ${linea.orden.productoNombre}`;
}

/**
 * Segunda línea de la orden: turno y maquinista, los únicos datos de contexto
 * que hoy entrega `LineaEstado` (no hay lote en el contrato de tiempo real).
 */
function metaOrden(linea: LineaEstado, resumen: ResumenTurno): string {
  const turno = resumen.turnoLabel || (linea.orden ? TURNO_LABEL[linea.orden.turno] : '');
  const partes = [
    turno ? `Turno ${turno}${resumen.turnoRango ? ` ${resumen.turnoRango}` : ''}` : null,
    linea.maquinistaNombre ? `Maquinista ${linea.maquinistaNombre}` : null,
  ].filter(Boolean);
  return partes.join(' · ');
}

/** Mensaje contextual del chip: parada abierta, detección IoT o riesgo de IA. */
function mensajeLinea(linea: LineaEstado): string | undefined {
  switch (linea.estado) {
    case 'parada':
      return linea.ultimaParada
        ? `Parada abierta · ${linea.ultimaParada.causaCodigo} ${linea.ultimaParada.causaNombre} · ${formatDurationMin(linea.ultimaParada.duracionMin)}`
        : `Parada abierta · ${formatDurationMin(linea.tiempoEnEstadoMin)} sin producir`;
    case 'sugerida':
      return linea.deteccion?.texto;
    case 'alerta':
      return linea.alerta
        ? `${linea.alerta.texto} · probabilidad ${formatNumber(linea.alerta.riesgo)} %`
        : undefined;
    default:
      return undefined;
  }
}

/** Marca la métrica cuando la cifra sale de los sensores IoT y no de un registro. */
function sufijoSensores(fuente: LineaEstado['fuenteProduccion']): string {
  return fuente === 'sensores' ? ' · sensores' : '';
}

/** Por qué el conteo IoT de una línea instrumentada vale lo que vale. */
const DETALLE_ESTADO_IOT: Record<EstadoSensoresIot, string> = {
  ok: 'conteo en vivo',
  parcial: 'conteo en vivo sin algún sensor (sin referencia al inicio de la orden)',
  sensor_offline: 'sin señal: se muestra el último conteo',
  sin_conteo: 'el IoT no dio el conteo de la orden: producido manual',
  inconsistente: 'contador reiniciado: producido manual',
  sin_orden: 'sin orden en curso',
  api_caida: 'el servicio IoT no responde: producido manual',
};

export interface IndicadorSensores {
  texto: string;
  color: BadgeColor;
  /** Punto de estado: sólo cuando hay sensores que contar. */
  dot: boolean;
  /** Detalle para el `title`: sensor a sensor y salud del conteo. */
  detalle: string;
}

/**
 * Indicador de sensores IoT de la tarjeta: `3/3 sensores` en verde, ámbar si
 * falta alguno y rojo si no queda ninguno en línea. El "en línea" ya llega con
 * la ventana de gracia de la API, así que no parpadea con cada reconexión WiFi.
 */
export function indicadorSensores(linea: LineaEstado): IndicadorSensores {
  const s = linea.sensores;
  if (!s) {
    return {
      texto: 'Sin sensores',
      color: 'neutral',
      dot: false,
      detalle: 'Línea sin sensores IoT: datos de los registros manuales',
    };
  }
  if (!s.consultado) {
    return {
      texto: 'Sensores sin respuesta',
      color: 'warning',
      dot: false,
      detalle: `${s.lineal}: ${DETALLE_ESTADO_IOT.api_caida}`,
    };
  }
  const color: BadgeColor =
    s.enLinea === 0 ? 'critical' : s.enLinea < s.total ? 'warning' : 'success';
  const lista = s.sensores.map((x) => `${x.id} ${x.enLinea ? 'en línea' : 'sin señal'}`).join(', ');
  const ultima = s.ultimaLectura ? ` · última lectura ${formatTime(s.ultimaLectura)}` : '';
  return {
    texto: `${s.enLinea}/${s.total} sensores`,
    color,
    dot: true,
    detalle: `${s.lineal}: ${lista} · ${DETALLE_ESTADO_IOT[s.estado]}${ultima}`,
  };
}

/** Nota de la métrica de tiempo, según el estado de la línea. */
const NOTA_TIEMPO: Record<EstadoLinea, string> = {
  produciendo: 'en producción',
  parada: 'en parada',
  alerta: 'desde la última alerta',
  sugerida: 'sin pulsos del sensor',
  sin_orden: 'sin actividad',
};

type ResumenTurno = Pick<TiempoRealResumen, 'turnoLabel' | 'turnoRango'>;

/**
 * Cuatro celdas de métricas del turno: producido, velocidad, última parada y
 * tiempo en el estado actual. La tercera celda pasará a ser el OEE del turno
 * en cuanto `LineaEstado` lo exponga (hoy el contrato no lo trae). El turno no
 * se repite aquí: ya está en la cabecera de la página y en la fila de la orden.
 */
function metricasLinea(linea: LineaEstado): LineCardProps['metrics'] {
  const conOrden = Boolean(linea.orden);
  const avance = linea.plan > 0 ? (linea.producido / linea.plan) * 100 : 0;
  const desvio =
    linea.velocidadEstandar > 0
      ? ((linea.velocidad - linea.velocidadEstandar) / linea.velocidadEstandar) * 100
      : 0;
  return [
    {
      label: 'Producido',
      value: conOrden ? `${formatNumber(linea.producido)} u` : '—',
      note: conOrden
        ? `${formatPct(avance, 0)} de ${formatNumber(linea.plan)} u${sufijoSensores(linea.fuenteProduccion)}`
        : 'sin producción',
    },
    {
      label: 'Velocidad',
      value: conOrden ? `${formatNumber(linea.velocidad)} u/min` : '—',
      note: conOrden
        ? `objetivo ${formatNumber(linea.velocidadEstandar, 1)} · ${formatDelta(desvio, '%', 0)}${sufijoSensores(linea.fuenteVelocidad)}`
        : `objetivo ${formatNumber(linea.velocidadEstandar, 1)} u/min`,
    },
    {
      label: 'Última parada',
      value: linea.ultimaParada ? formatDurationMin(linea.ultimaParada.duracionMin) : '—',
      note: linea.ultimaParada
        ? `${linea.ultimaParada.causaCodigo} · ${linea.ultimaParada.enCurso ? 'en curso' : formatTime(linea.ultimaParada.inicio)}`
        : 'sin paradas en el turno',
    },
    {
      label: 'Tiempo en estado',
      value: formatDurationMin(linea.tiempoEnEstadoMin),
      note: NOTA_TIEMPO[linea.estado],
    },
  ];
}

/** Tono de la barra de avance: rojo en parada, ámbar en riesgo, verde/azul si produce. */
function tonoAvance(linea: LineaEstado): NonNullable<LineCardProps['progress']>['tone'] {
  switch (linea.estado) {
    case 'parada':
      return 'error';
    case 'alerta':
    case 'sugerida':
      return 'warning';
    case 'sin_orden':
      return 'neutral';
    default:
      return 'success';
  }
}

/**
 * Datos visuales de la Line card **compacta** (panel del maquinista y catálogo
 * de componentes): cabecera en una línea, 3 métricas y timeline de segmentos.
 */
export function lineCardProps(
  linea: LineaEstado,
  resumen: ResumenTurno,
): Pick<LineCardProps, 'line' | 'order' | 'state' | 'badgeLabel' | 'metrics' | 'segments' | 'message'> {
  const conOrden = Boolean(linea.orden);
  const avance = linea.plan > 0 ? Math.round((linea.producido / linea.plan) * 100) : 0;
  return {
    line: `${linea.lineaCodigo} · ${linea.lineaNombre}`,
    order: textoOrden(linea),
    state: estadoLineCard(linea.estado),
    badgeLabel: badgeLinea(linea),
    metrics: [
      {
        label: 'Producido',
        value: conOrden ? `${formatNumber(linea.producido)} u` : '—',
        note: conOrden ? `${formatNumber(avance)} % del objetivo` : 'sin producción',
      },
      {
        label: 'Velocidad',
        value: conOrden ? `${formatNumber(linea.velocidad)} u/min` : '—',
        note: conOrden ? `objetivo ${formatNumber(linea.velocidadEstandar)}` : '—',
      },
      {
        label: 'Turno',
        value: resumen.turnoLabel,
        note: resumen.turnoRango,
      },
    ],
    segments: SEGMENTOS[linea.estado],
    message:
      linea.estado === 'sugerida'
        ? linea.deteccion?.texto
        : linea.estado === 'alerta'
          ? linea.alerta?.texto
          : undefined,
  };
}

/**
 * Datos visuales de la Line card **ampliada** del tablero de Tiempo real:
 * cabecera con código + nombre completo, fila de orden con turno y maquinista,
 * 4 métricas, barra de avance etiquetada y mensaje contextual del estado.
 */
export function lineCardAmpliaProps(
  linea: LineaEstado,
  resumen: ResumenTurno,
): Pick<
  LineCardProps,
  'line' | 'code' | 'order' | 'meta' | 'state' | 'badgeLabel' | 'metrics' | 'progress' | 'message' | 'layout'
> {
  const conOrden = Boolean(linea.orden);
  const avance = linea.plan > 0 ? (linea.producido / linea.plan) * 100 : 0;
  return {
    layout: 'expanded',
    code: linea.lineaCodigo,
    line: linea.lineaNombre,
    order: textoOrden(linea),
    meta: metaOrden(linea, resumen),
    state: estadoLineCard(linea.estado),
    badgeLabel: badgeLinea(linea),
    metrics: metricasLinea(linea),
    progress: {
      value: avance,
      label: conOrden ? 'Avance del objetivo del turno' : 'Sin objetivo asignado',
      valueLabel: conOrden
        ? `${formatPct(avance, 0)} · ${formatNumber(linea.producido)} / ${formatNumber(linea.plan)} u`
        : '—',
      tone: tonoAvance(linea),
    },
    message: mensajeLinea(linea),
  };
}
