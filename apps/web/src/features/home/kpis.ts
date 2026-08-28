import type { KpiValor } from '@mes/types';
import { formatCurrency, formatDelta, formatKg, formatMinutes, formatNumber, formatPct } from '@mes/shared';

/** Props de presentación de una `KpiCard` ya resueltas desde el contrato de API. */
export interface KpiVista {
  id: string;
  label: string;
  value: string;
  delta?: string;
  trend: 'up' | 'down' | 'flat';
  /** `true` cuando el movimiento del delta es bueno para el negocio. */
  favorable: boolean;
  context?: string;
}

/** `79.8 %` · `412 kg` · `1,4 min` · `S/ 3 860` · `48` según la unidad del KPI. */
export function formatValor(valor: number, unidad: string): string {
  switch (unidad) {
    case '%':
      return formatPct(valor);
    case 'min':
      return formatMinutes(valor);
    case 'kg':
      return formatKg(valor);
    case 'S/':
      return formatCurrency(valor);
    default:
      return unidad ? `${formatNumber(valor)} ${unidad}` : formatNumber(valor);
  }
}

/**
 * Traduce un `KpiValor` del API a las props de la KPI card. La flecha indica la
 * dirección del movimiento y el color la favorabilidad: en `Merma del día` una
 * bajada es verde aunque la flecha apunte hacia abajo (frame 2163:17435).
 */
export function toKpiVista(kpi: KpiValor, overrides: Partial<KpiVista> = {}): KpiVista {
  const delta = kpi.delta;
  const trend: KpiVista['trend'] = !delta || delta.valor === 0 ? 'flat' : delta.valor > 0 ? 'up' : 'down';
  const favorable = !delta || delta.valor === 0 ? false : delta.valor > 0 === delta.favorableSiSube;
  return {
    id: kpi.id,
    label: kpi.label,
    value: formatValor(kpi.valor, kpi.unidad),
    delta: delta ? formatDelta(delta.valor, delta.unidad) : undefined,
    trend,
    favorable,
    context: delta?.referencia,
    ...overrides,
  };
}

/** Busca un KPI por id dentro de la respuesta de un reporte. */
export function buscarKpi(kpis: readonly KpiValor[] | undefined, id: string): KpiValor | undefined {
  return kpis?.find((k) => k.id === id);
}
