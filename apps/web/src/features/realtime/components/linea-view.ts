import type { LineCardProps, LineSegment, LineState } from '@mes/ui';
import type { EstadoLinea, LineaEstado, TiempoRealResumen } from '@mes/types';
import { formatNumber } from '@mes/shared';

/** `sin_orden` (API) → `sin-orden` (prop `state` de MES / Line card). */
export function estadoLineCard(estado: EstadoLinea): LineState {
  return estado === 'sin_orden' ? 'sin-orden' : estado;
}

/**
 * Timeline de 8 px de la Line card (Figma 2153:238): 4 segmentos en los estados
 * base y 5 en Alerta/Sugerida, con el último tramo del color del estado actual.
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
      return `En parada · ${formatNumber(linea.tiempoEnEstadoMin)} min`;
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

function textoOrden(linea: LineaEstado): string {
  if (!linea.orden) return 'Sin orden asignada · línea disponible';
  const base = `${linea.orden.codigo} · ${linea.orden.productoNombre}`;
  if (linea.estado === 'parada' && linea.ultimaParada) {
    return `${base} · ${linea.ultimaParada.causaCodigo} ${linea.ultimaParada.causaNombre}`;
  }
  return base;
}

/** Datos visuales de una Line card a partir del estado de la línea. */
export function lineCardProps(
  linea: LineaEstado,
  resumen: Pick<TiempoRealResumen, 'turnoLabel' | 'turnoRango'>,
): Pick<LineCardProps, 'line' | 'order' | 'state' | 'badgeLabel' | 'metrics' | 'segments' | 'message'> {
  const avance = linea.plan > 0 ? Math.round((linea.producido / linea.plan) * 100) : 0;
  const conOrden = Boolean(linea.orden);
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
