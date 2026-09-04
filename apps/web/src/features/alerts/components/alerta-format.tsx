import type { BadgeColor, ProgressBarProps } from '@mes/ui';
import type { Alerta, EstadoAlerta, SeveridadAlerta } from '@mes/types';

/** Severidad → color de Badge (Figma 2156:5417, columna SEVERIDAD). */
export const SEVERIDAD_BADGE: Record<SeveridadAlerta, BadgeColor> = {
  critica: 'critical',
  alta: 'warning',
  media: 'informational',
};

/** Estado → color de Badge (Activa=Warning · Atendida/Confirmada=Success · Vencida=Critical). */
export const ESTADO_BADGE: Record<EstadoAlerta, BadgeColor> = {
  activa: 'warning',
  atendida: 'success',
  confirmada: 'success',
  vencida: 'critical',
  descartada: 'neutral',
};

/**
 * Tono de la barra de probabilidad (Figma: ≥ 80 % rojo, ≥ 70 % ámbar, resto
 * gris). El color acompaña al número, nunca lo sustituye.
 */
export function toneProbabilidad(probabilidad: number): NonNullable<ProgressBarProps['tone']> {
  if (probabilidad >= 80) return 'error';
  if (probabilidad >= 70) return 'warning';
  return 'neutral';
}

/** Tono de la barra de contribución de un factor del bloque "Por qué". */
export function toneFactor(indice: number): NonNullable<ProgressBarProps['tone']> {
  if (indice === 0) return 'error';
  if (indice === 1) return 'warning';
  return 'neutral';
}

/** `2026-08-28T14:40:00` + `…T15:20:00` → `14:40–15:20`. */
export function formatVentana(inicio: string, fin: string): string {
  return `${horaDeIso(inicio)}–${horaDeIso(fin)}`;
}

export function horaDeIso(valor: string): string {
  const parte = valor.includes('T') ? valor.split('T')[1] : valor;
  return (parte ?? valor).slice(0, 5);
}

/** `LLEN-M2 Llenadora M2` para la columna LÍNEA (no hay nivel máquina). */
export function etiquetaLinea(alerta: Alerta): string {
  return `${alerta.lineaCodigo} ${alerta.lineaNombre}`;
}

/** La ventana ya se cerró: habilita el bloque "Resultado real" del drawer. */
export function ventanaCerrada(alerta: Alerta): boolean {
  return new Date(alerta.ventanaFin).getTime() <= Date.now();
}

/** Una alerta espera confirmación de evento real (alimenta el KPI EP). */
export function esperaConfirmacion(alerta: Alerta): boolean {
  return alerta.acierto === null && alerta.estado !== 'activa' && alerta.estado !== 'descartada';
}

/** Marca de acierto de la tabla: ✓ verde · ✗ rojo · — gris. */
export function AciertoMark({ acierto }: { acierto: boolean | null }) {
  if (acierto === null) {
    return (
      <span className="text-body-md font-semibold text-text-disabled" aria-label="Sin confirmar">
        —
      </span>
    );
  }
  return acierto ? (
    <span className="text-body-md font-semibold text-success-text" aria-label="Acierto">
      ✓
    </span>
  ) : (
    <span className="text-body-md font-semibold text-error-text" aria-label="Fallo">
      ✗
    </span>
  );
}
