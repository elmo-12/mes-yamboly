/**
 * Tema único de los gráficos MES (Figma `Chart / …` de Home, Reportes y Analítica).
 *
 * No existe componente de chart en el MDS: se construyen a mano con la paleta
 * de `docs/design-system.md` §7. Los valores repiten los tokens de
 * `@mes/ui/theme.css` porque recharts necesita colores resueltos (no acepta
 * `var(--color-…)` en SVG server-rendered de forma fiable).
 */

export const chartColors = {
  /** Serie principal (`primary/default`). */
  primary: '#2563EB',
  /** Segunda intensidad de la misma familia (apilados, heatmap). */
  primaryDark: '#1D4ED8',
  /** Favorable / meta cumplida. */
  success: '#16A34A',
  /** Atención (meta, umbral). */
  warning: '#F59E0B',
  /** Crítico (causa dominante, umbral superado). */
  danger: '#DC2626',
  /** Serie de referencia / acumulada. */
  reference: '#9CA3AF',
  /** Ejes y etiquetas de eje. */
  axis: '#6B7280',
  /** Retícula horizontal. */
  grid: '#F3F4F6',
  /** Línea base del eje X. */
  axisLine: '#E5E7EB',
  /** Fondo del track de las barras horizontales. */
  track: '#F3F4F6',
  surface: '#FFFFFF',
} as const;

/**
 * Orden fijo de las series categóricas. Nunca se cicla ni se genera un color
 * nuevo: a partir de la quinta serie hay que agrupar en «Otras».
 */
export const chartSeries = [
  chartColors.primary,
  chartColors.success,
  chartColors.warning,
  chartColors.danger,
] as const;

/** Tipografía de ejes: 12/400 `text/secondary` (Figma). */
export const axisTick = { fontSize: 12, fill: chartColors.axis } as const;

/** Props comunes de `<XAxis>` / `<YAxis>`: sin línea de eje ni ticks. */
export const axisProps = {
  tick: axisTick,
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

/** Props comunes de `<CartesianGrid>`: solo horizontales, 1 px `divider`. */
export const gridProps = {
  stroke: chartColors.grid,
  vertical: false,
  strokeDasharray: '0',
} as const;

/** Trazo de las líneas de referencia (meta, umbral). */
export const referenceLineProps = {
  strokeDasharray: '4 4',
  strokeWidth: 1,
} as const;

/** Márgenes por defecto del área de plot. */
export const chartMargin = { top: 8, right: 16, bottom: 0, left: 0 } as const;

/** Escala de 5 pasos del heatmap (`primary/subtle` → `primary`). */
export const heatmapScale = ['#F9FAFB', '#EFF6FF', '#DBEAFE', '#93C5FD', '#2563EB'] as const;

/* ------------------------------------------------------------------ */
/* Alias y utilidades compartidas (aditivo · V1 Home)                  */
/* ------------------------------------------------------------------ */

/** Alias de `axisProps` con el nombre usado en Home/Evidencia. */
export const chartAxis = axisProps;
/** Alias de `gridProps`. */
export const chartGrid = gridProps;

/** Trazo de la línea de meta: punteado gris `text/disabled`. */
export const chartMeta = {
  ...referenceLineProps,
  stroke: chartColors.reference,
} as const;

/** Cursor del tooltip: velo `background/subtle`, sin borde. */
export const chartCursor = { fill: '#F9FAFB', stroke: 'none' } as const;

/** Track de las barras horizontales (`divider`). */
export const chartTrack = chartColors.track;

/** Orden fijo de asignación de color a series sin color propio. */
export const CHART_SERIES_ORDER = chartSeries;

/** Color de la serie `i` (nunca cicla más allá de las cuatro de la paleta). */
export function serieColor(index: number): string {
  return chartSeries[index % chartSeries.length] as string;
}

/**
 * Escala semántica del OEE, alineada con `clasificarOee` de `@mes/shared`:
 * ≥ meta verde · 70–meta azul · < 70 rojo (frame 2163:17435, L4 a 61,2 %).
 */
export function colorPorOee(oee: number, meta = 85): string {
  if (oee >= meta) return chartColors.success;
  if (oee >= 70) return chartColors.primary;
  return chartColors.danger;
}

/** Escala del avance producido/plan: verde ≥95 %, azul 85–95 %, ámbar <85 % (§3.2). */
export function colorPorAvance(pct: number): string {
  if (pct >= 95) return chartColors.success;
  if (pct >= 85) return chartColors.primary;
  return chartColors.warning;
}

/** Radio pill de las barras horizontales, en el orden que espera recharts. */
export const BAR_RADIUS_X: [number, number, number, number] = [8, 8, 8, 8];
/** Radio superior de las barras verticales. */
export const BAR_RADIUS_Y: [number, number, number, number] = [4, 4, 0, 0];

/** Altos de referencia leídos de Figma (§7 y spec 06.A). */
export const CHART_HEIGHT = {
  /** Gráfico dominante de Home (720×272 con cabecera 24 + padding 16). */
  home: 196,
  /** Panel de ranking de Home (380×272). */
  panel: 196,
  /** Tendencia de Reportes (1116×300). */
  wide: 224,
  /** Gráficos secundarios en dos columnas. */
  half: 220,
} as const;
