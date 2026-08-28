'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Badge,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
} from '@mes/ui';
import type { EvidenciaResumen } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import {
  ChartFrame,
  ChartLegendItem,
  ChartTooltip,
  chartAxis,
  chartColors,
  chartGrid,
} from '@/components/charts';
import { ESTADO_KPI_BADGE, ESTADO_KPI_LABEL, KpiRow, KpiTesisCard, formatValorKpi } from './evidencia-format';

/**
 * `Evidencia / Resumen` — Figma 2156:5682.
 * 5 KPI card (4 + 1), barras pareadas pretest vs postest del TRI y tabla
 * resumen de los cinco instrumentos.
 */
export function ResumenTab({ resumen }: { resumen: EvidenciaResumen }) {
  const datos = resumen.comparativaTri.map((punto) => ({
    etapa: punto.etapa,
    minutos: punto.minutos,
  }));

  return (
    <div className="flex flex-col gap-6">
      <KpiRow>
        {resumen.kpis.map((kpi) => (
          <KpiTesisCard key={kpi.id} kpi={kpi} />
        ))}
      </KpiRow>

      <SectionTitle
        title="Pretest vs postest"
        description="Tiempo medio de registro por evento (KPI1 TRI) · diseño preexperimental de un solo grupo"
        className="border-b border-divider pb-3"
      />

      <ChartFrame
        className="max-w-[680px]"
        height={240}
        note="Minutos por evento"
        legend={
          <>
            <ChartLegendItem color={chartColors.reference} label="Pretest (registro manual)" />
            <ChartLegendItem color={chartColors.primary} label="Postest (MES Yamboly)" />
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="35%">
            <CartesianGrid {...chartGrid} />
            <XAxis dataKey="etapa" {...chartAxis} />
            <YAxis {...chartAxis} width={44} tickFormatter={(v: number) => formatNumber(v, 1)} />
            <Tooltip
              cursor={{ fill: 'var(--color-background-subtle)' }}
              content={<ChartTooltip />}
            />
            <Bar dataKey="minutos" name="Minutos por evento" radius={[4, 4, 0, 0]} maxBarSize={72}>
              {datos.map((punto) => (
                <Cell
                  key={punto.etapa}
                  fill={punto.etapa === 'Pretest' ? chartColors.reference : chartColors.primary}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <SectionTitle
        title="Resumen de instrumentos y KPI de la tesis"
        description={`5 instrumentos · diseño preexperimental de un solo grupo · Pretest ${formatDate(
          resumen.pretestDesde,
        )} – ${formatDate(resumen.pretestHasta)} · Postest ${formatDate(resumen.postestDesde)} – ${formatDate(
          resumen.postestHasta,
        )}`}
        className="border-b border-divider pb-3"
      />

      <Table density="dense">
        <THead>
          <tr>
            <TH>Instrumento</TH>
            <TH className="w-25">Anexo</TH>
            <TH className="w-20">KPI</TH>
            <TH className="w-45">Fórmula</TH>
            <TH className="w-25" numeric>
              Postest
            </TH>
            <TH className="w-40">Meta</TH>
            <TH className="w-30">Estado</TH>
          </tr>
        </THead>
        <TBody>
          {resumen.kpis.map((kpi) => (
            <TRow key={kpi.id} plain>
              <TCell className="font-medium">{kpi.nombre}</TCell>
              <TCell muted>{kpi.anexo}</TCell>
              <TCell muted>{kpi.id}</TCell>
              <TCell muted className="tabular">
                {kpi.formula}
              </TCell>
              <TCell numeric className="font-medium">
                {formatValorKpi(kpi)}
              </TCell>
              <TCell muted>{kpi.meta}</TCell>
              <TCell>
                <Badge color={ESTADO_KPI_BADGE[kpi.estado]}>{ESTADO_KPI_LABEL[kpi.estado]}</Badge>
              </TCell>
            </TRow>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
