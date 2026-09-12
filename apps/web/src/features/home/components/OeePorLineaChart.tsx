'use client';

import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OeePorLinea } from '@mes/types';
import { formatPct } from '@mes/shared';
import {
  BAR_RADIUS_X,
  CHART_HEIGHT,
  ChartFrame,
  ChartTooltip,
  chartAxis,
  chartCursor,
  chartMeta,
  chartTrack,
  colorPorOee,
} from '@/components/charts';

export interface OeePorLineaChartProps {
  datos: readonly OeePorLinea[];
  /** Meta de OEE en puntos porcentuales (línea punteada). */
  meta?: number;
  title?: string;
}

/**
 * Gráfico dominante del Home (Figma 2163:19370 · design-system §7): 720×272.
 * Barras horizontales de 16 px sobre track `divider`, etiqueta de línea a la
 * izquierda (104), valor a la derecha y línea de meta punteada al 85 %.
 *
 * El alto crece con el número de filas: el de Figma da para cinco líneas y, con
 * más, recharts empezaba a saltarse etiquetas del eje —se veían nueve barras y
 * sólo cinco nombres—. El mínimo mantiene la proporción del frame cuando hay
 * pocas líneas produciendo.
 */
export function OeePorLineaChart({
  datos,
  meta = 85,
  title = 'OEE por línea — turno actual',
}: OeePorLineaChartProps) {
  const filas = datos.map((l) => ({
    etiqueta: `${l.lineaCodigo} · ${l.lineaNombre}`,
    oee: l.oee,
  }));

  /* El valor vive en una columna fija a la derecha (x=636 en Figma), no pegado
     al extremo de la barra: se dibuja como segundo eje de categorías. */
  const valorPorEtiqueta = new Map(filas.map((f) => [f.etiqueta, f.oee]));

  return (
    /* Con marco 1 px r12 como en `Home / Dashboard Jefe` (Figma 2163:17435). */
    <ChartFrame
      title={title}
      note={`Meta ${formatPct(meta, 0)}`}
      height={Math.max(CHART_HEIGHT.home, filas.length * 36 + 16)}
      className="min-w-0 flex-[720_1_0] basis-0"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={filas}
          barSize={16}
          margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            yAxisId="lineas"
            type="category"
            dataKey="etiqueta"
            width={104}
            tick={chartAxis.tick}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="valores"
            type="category"
            dataKey="etiqueta"
            orientation="right"
            width={64}
            tick={{ fontSize: 12, fontWeight: 600, fill: '#111827' }}
            tickFormatter={(etiqueta: string) => formatPct(valorPorEtiqueta.get(etiqueta) ?? 0)}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={chartCursor}
            content={<ChartTooltip unit="%" hideLabel={false} />}
          />
          <ReferenceLine yAxisId="lineas" x={meta} {...chartMeta} />
          <Bar
            yAxisId="lineas"
            dataKey="oee"
            name="OEE"
            radius={BAR_RADIUS_X}
            background={{ fill: chartTrack, radius: 8 }}
            isAnimationActive={false}
          >
            {filas.map((fila) => (
              <Cell key={fila.etiqueta} fill={colorPorOee(fila.oee, meta)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
