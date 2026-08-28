import { z } from 'zod';
import type { Delta, Periodo, Turno } from './common';
import type { TipoMermaCodigo } from './catalogs';

export interface KpiValor {
  id: string;
  label: string;
  valor: number;
  unidad: string;
  delta?: Delta;
  /** Meta de referencia (línea punteada en los gráficos). */
  meta?: number;
}

/* ------------------------------------------------------------------ */
/* Indicadores (spec 06.A)                                             */
/* ------------------------------------------------------------------ */

export interface TendenciaOeePunto {
  /** ISO `YYYY-MM-DD` */
  fecha: string;
  /** `28 ago` */
  etiqueta: string;
  oee: number;
  meta: number;
}

export interface OeePorLinea {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  oee: number;
  disponibilidad: number;
  desempeno: number;
  calidad: number;
}

export interface ComparativaTurno {
  turno: Turno;
  turnoLabel: string;
  oee: number;
  disponibilidad: number;
  desempeno: number;
  calidad: number;
  /** Δ en puntos porcentuales respecto del periodo comparado. */
  deltaOee: number;
}

export interface IndicadoresResumen {
  periodo: Periodo;
  desde: string;
  hasta: string;
  kpis: KpiValor[];
  tendenciaOee: TendenciaOeePunto[];
  oeePorLinea: OeePorLinea[];
  comparativaTurno: ComparativaTurno[];
}

/* ------------------------------------------------------------------ */
/* Paradas (spec 06.B)                                                 */
/* ------------------------------------------------------------------ */

export interface ParetoParada {
  causaCodigo: string;
  causaNombre: string;
  minutos: number;
  /** Porcentaje acumulado de la curva de Pareto. */
  acumuladoPct: number;
}

export interface DonutSegmento {
  clave: string;
  label: string;
  valor: number;
  pct: number;
}

export interface DetalleCausaParada {
  causaId: string;
  causaCodigo: string;
  causaNombre: string;
  cantidad: number;
  minutos: number;
  pct: number;
  lineaMasAfectada: string;
  /** Serie corta para el sparkline de tendencia. */
  tendencia: number[];
}

export interface ParadasResumen {
  periodo: Periodo;
  desde: string;
  hasta: string;
  kpis: KpiValor[];
  pareto: ParetoParada[];
  donut: DonutSegmento[];
  detallePorCausa: DetalleCausaParada[];
}

/* ------------------------------------------------------------------ */
/* Mermas (spec 06.C)                                                  */
/* ------------------------------------------------------------------ */

export interface MermaApiladaLinea {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  MP: number;
  EP: number;
  PT: number;
  total: number;
}

export interface HeatmapCelda {
  /** Eje Y: código de causa o de tipo. */
  fila: string;
  filaLabel: string;
  /** Eje X: turno. */
  columna: string;
  columnaLabel: string;
  valor: number;
}

export interface DetalleCausaMerma {
  causaId: string;
  causaCodigo: string;
  causaNombre: string;
  kg: number;
  pct: number;
  tipoPredominante: TipoMermaCodigo;
  lineaMasAfectada: string;
}

export interface MermasResumen {
  periodo: Periodo;
  desde: string;
  hasta: string;
  kpis: KpiValor[];
  apiladasPorLinea: MermaApiladaLinea[];
  heatmap: HeatmapCelda[];
  tabla: DetalleCausaMerma[];
}

export interface ReporteQuery {
  periodo?: Periodo;
  desde?: string;
  hasta?: string;
  lineaId?: string | string[];
  turno?: Turno | Turno[];
  comparar?: 'periodo_anterior' | 'anio_anterior';
}

/* ------------------------------------------------------------------ */
/* Exportaciones (spec 06.D)                                           */
/* ------------------------------------------------------------------ */

export const DATASETS_EXPORT = [
  'ordenes',
  'paradas',
  'mermas',
  'velocidades',
  'indicadores',
  'alertas',
  'evidencia',
] as const;
export type DatasetExport = (typeof DATASETS_EXPORT)[number];

export const DATASET_EXPORT_LABEL: Record<DatasetExport, string> = {
  ordenes: 'Órdenes',
  paradas: 'Paradas',
  mermas: 'Mermas',
  velocidades: 'Velocidades',
  indicadores: 'Indicadores OEE',
  alertas: 'Alertas',
  evidencia: 'Evidencia TRI/TCI',
};

export const FORMATOS_EXPORT = ['xlsx', 'csv', 'pdf'] as const;
export type FormatoExport = (typeof FORMATOS_EXPORT)[number];

export const ESTADOS_EXPORT = ['listo', 'generando', 'error'] as const;
export type EstadoExport = (typeof ESTADOS_EXPORT)[number];

export interface ExportJob {
  id: string;
  nombre: string;
  datasets: DatasetExport[];
  formato: FormatoExport;
  /** ISO-8601 con hora. */
  solicitadoEn: string;
  solicitadoPor: string;
  estado: EstadoExport;
  /** Tamaño legible: `2,4 MB`. */
  tamano?: string;
  url?: string;
}

export const exportRequestSchema = z.object({
  datasets: z.array(z.enum(DATASETS_EXPORT)).min(1, 'Selecciona al menos un dataset'),
  formato: z.enum(FORMATOS_EXPORT).default('xlsx'),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  lineaId: z.string().optional(),
});
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
export type ExportRequest = ExportRequestInput;
