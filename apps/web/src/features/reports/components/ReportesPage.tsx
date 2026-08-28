'use client';

import * as React from 'react';
import {
  Button,
  Divider,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { formatDate } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { useSession } from '@/hooks/use-session';
import { useExportar } from '../hooks';
import { REPORT_TABS, REPORT_TAB_LABEL, useReportFilters, type ReportTab } from '../url-state';
import { ExportarTab } from './ExportarTab';
import { IndicadoresTab } from './IndicadoresTab';
import { MermasTab } from './MermasTab';
import { ParadasTab } from './ParadasTab';
import { ProgramarEnvioModal } from './ProgramarEnvioModal';
import { ReportesFilterBar } from './ReportesFilterBar';
import { TiemposEstandarTab } from './TiemposEstandarTab';

/** Conjuntos exportados por la acción rápida "Exportar" del page header. */
const EXPORT_RAPIDO = ['indicadores', 'paradas', 'mermas'] as const;

/**
 * `MES / Reportes` (Figma 2163:18418 · 2163:18594 · 2163:19459 · 2163:19635).
 * Page header + Tabs + Filter bar; el estado vive en `searchParams`.
 */
export function ReportesPage() {
  const { filtros, query, setFiltros, limpiar, hayFiltros } = useReportFilters();
  const { user } = useSession();
  const [programarAbierto, setProgramarAbierto] = React.useState(false);
  const exportar = useExportar();

  const subtitulo: Record<ReportTab, string> = {
    indicadores: 'Indicadores operativos · Comparación por línea, turno y periodo',
    paradas: 'Análisis de paradas · Causas codificadas y minutos perdidos',
    mermas: 'Mermas por línea, tipo y causa · MP / EP / PT',
    tiempos: 'Tiempos estándar frente al promedio real por causa',
    exportar: 'Exportar datos · Genera archivos XLSX, CSV o PDF con los datos del periodo',
  };

  const exportarRapido = () => {
    exportar.mutate(
      {
        datasets: [...EXPORT_RAPIDO],
        formato: 'xlsx',
        desde: filtros.desde,
        hasta: filtros.hasta,
      },
      {
        onSuccess: () =>
          toast.success('Exportación en curso', {
            description: `Indicadores, paradas y mermas de ${formatDate(filtros.desde)} a ${formatDate(filtros.hasta)}.`,
          }),
        onError: () => toast.error('No se pudo generar el archivo'),
      },
    );
  };

  return (
    <>
      <AppPageHeader
        title="Reportes"
        subtitle={subtitulo[filtros.tab]}
        breadcrumb={[
          { label: 'Inicio', href: '/' },
          { label: 'Reportes', href: '/reportes' },
          { label: REPORT_TAB_LABEL[filtros.tab] },
        ]}
        linkComponent={AppLink}
        actions={
          <>
            <Button variant="secondary" onClick={() => setProgramarAbierto(true)}>
              Programar envío
            </Button>
            {filtros.tab !== 'exportar' && (
              <Button
                variant="primary"
                icon={<Icon name="file-xls" />}
                loading={exportar.isPending}
                onClick={exportarRapido}
              >
                Exportar
              </Button>
            )}
          </>
        }
      />

      <Tabs value={filtros.tab} onValueChange={(v) => setFiltros({ tab: v as ReportTab })}>
        <TabsList>
          {REPORT_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {REPORT_TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        {filtros.tab !== 'exportar' && (
          <div className="flex flex-col gap-6 pt-6">
            <ReportesFilterBar
              filtros={filtros}
              onChange={setFiltros}
              onLimpiar={limpiar}
              hayFiltros={hayFiltros}
            />
            <Divider />
          </div>
        )}

        <TabsContent value="indicadores">
          <IndicadoresTab query={query} onLimpiar={limpiar} />
        </TabsContent>
        <TabsContent value="paradas">
          <ParadasTab query={query} onLimpiar={limpiar} />
        </TabsContent>
        <TabsContent value="mermas">
          <MermasTab query={query} onLimpiar={limpiar} />
        </TabsContent>
        <TabsContent value="tiempos">
          <TiemposEstandarTab query={query} onLimpiar={limpiar} />
        </TabsContent>
        <TabsContent value="exportar">
          <ExportarTab desde={filtros.desde} hasta={filtros.hasta} />
        </TabsContent>
      </Tabs>

      <ProgramarEnvioModal
        open={programarAbierto}
        onOpenChange={setProgramarAbierto}
        correoSugerido={user?.email}
      />
    </>
  );
}
