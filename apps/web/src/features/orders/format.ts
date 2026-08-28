import type { BadgeColor } from '@mes/ui';
import type { EstadoOrden, TipoAuditoria } from '@mes/types';

/**
 * Semántica de color fijada en `docs/design-system.md` §3.5 para las pantallas
 * de Órdenes: el Badge nunca es interactivo, solo comunica el estado.
 */
export const ESTADO_ORDEN_COLOR: Record<EstadoOrden, BadgeColor> = {
  en_curso: 'informational',
  cerrada: 'neutral',
  por_validar: 'warning',
  validada: 'success',
  incompleta: 'critical',
};

export const TIPO_AUDITORIA_COLOR: Record<TipoAuditoria, BadgeColor> = {
  creacion: 'informational',
  edicion: 'warning',
  parada: 'critical',
  merma: 'accent',
  velocidad: 'neutral',
  validacion: 'success',
  sistema: 'neutral',
};

/** OEE en celda: ≥85 verde · 75–85 neutro · <75 ámbar (design-system §3.2). */
export function oeeToneClass(oee: number): string {
  if (oee >= 85) return 'text-success-text';
  if (oee >= 75) return 'text-text-primary';
  return 'text-warning-text';
}

/** Mini barra producido/plan: ≥95 % verde · 85–95 % azul · <85 % ámbar. */
export function planTone(producido: number, plan: number): 'success' | 'primary' | 'warning' {
  const pct = plan > 0 ? (producido / plan) * 100 : 0;
  if (pct >= 95) return 'success';
  if (pct >= 85) return 'primary';
  return 'warning';
}

export function planPct(producido: number, plan: number): number {
  return plan > 0 ? Math.min(100, (producido / plan) * 100) : 0;
}

/** `2026-08-28T07:42:00` → `07:42`. Devuelve `—` si aún no hay valor. */
export function hora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = iso.split('T')[1];
  return t ? t.slice(0, 5) : '—';
}

/** `2026-08-28` → `28/08`, formato corto de la columna FECHA. */
export function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return mes && dia ? `${dia}/${mes}` : iso;
}
