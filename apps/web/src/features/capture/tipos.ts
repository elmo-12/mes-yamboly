import type { LineaEstado, TiempoRealResumen } from '@mes/types';

/**
 * Contexto operativo que los overlays de captura precargan (spec 04.A:
 * "L2 · Conos · OF-2026-0815 · Turno Mañana · Jorge Quispe").
 */
export interface ContextoLinea {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  /** `L2 · Conos` */
  etiqueta: string;
  ordenId?: string;
  ordenCodigo?: string;
  productoNombre?: string;
  turnoLabel: string;
  turnoRango: string;
  velocidad: number;
  velocidadEstandar: number;
  producido: number;
  plan: number;
  maquinistaNombre?: string;
  deteccionId?: string;
  deteccionTexto?: string;
  deteccionHora?: string;
}

export function contextoDeLinea(linea: LineaEstado, resumen: TiempoRealResumen): ContextoLinea {
  return {
    lineaId: linea.lineaId,
    lineaCodigo: linea.lineaCodigo,
    lineaNombre: linea.lineaNombre,
    etiqueta: `${linea.lineaCodigo} · ${linea.lineaNombre}`,
    ordenId: linea.orden?.id,
    ordenCodigo: linea.orden?.codigo,
    productoNombre: linea.orden?.productoNombre,
    turnoLabel: resumen.turnoLabel,
    turnoRango: resumen.turnoRango,
    velocidad: linea.velocidad,
    velocidadEstandar: linea.velocidadEstandar,
    producido: linea.producido,
    plan: linea.plan,
    maquinistaNombre: linea.maquinistaNombre,
    deteccionId: linea.deteccion?.id,
    deteccionTexto: linea.deteccion?.texto,
    deteccionHora: linea.deteccion?.detectadaEn.slice(11, 16),
  };
}

/** Hora local `HH:mm` de "ahora" — valor por defecto del campo "Hora de inicio". */
export function horaActual(): string {
  return new Date().toTimeString().slice(0, 5);
}

/** `14:02` + hoy → ISO-8601 local que espera la API (`inicio`, `fin`). */
export function isoDesdeHora(hora: string): string {
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return `${fecha}T${/^\d{2}:\d{2}$/.test(hora) ? `${hora}:00` : '00:00:00'}`;
}
