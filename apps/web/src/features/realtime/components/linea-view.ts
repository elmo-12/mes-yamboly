import type { LineCardProps, LineSegment, LineState } from '@mes/ui';
import type { EstadoLinea, LineaEstado, TiempoRealResumen } from '@mes/types';
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

export function badgeLinea(linea: LineaEstado): string {
  switch (linea.estado) {
    case 'parada':
      return `En parada · ${formatDurationMin(linea.tiempoEnEstadoMin)}`;
    case 'alerta':
      return `Riesgo de parada ${formatNumber(linea.alerta?.riesgo ?? 0)} %`;
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
      note: conOrden ? `${formatPct(avance, 0)} de ${formatNumber(linea.plan)} u` : 'sin producción',
    },
    {
      label: 'Velocidad',
      value: conOrden ? `${formatNumber(linea.velocidad)} u/min` : '—',
      note: conOrden
        ? `objetivo ${formatNumber(linea.velocidadEstandar, 1)} · ${formatDelta(desvio, '%', 0)}`
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
