'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@mes/ui';
import { AppPageHeader } from '@/components/AppPageHeader';
import { formatDate } from '@mes/shared';
import { Forbidden } from '@/components/Forbidden';
import { PageSkeleton } from '@/components/PageSkeleton';
import { useRequireRole } from '@/hooks/use-require-role';
import {
  useEvidenciaCfs,
  useEvidenciaEp,
  useEvidenciaResumen,
  useEvidenciaTci,
  useEvidenciaTri,
  useEvidenciaTsp,
  useExportarEvidencia,
} from '../hooks';
import { AnexoError, AnexoSkeleton } from './evidencia-format';
import { CfsTab } from './CfsTab';
import { EpTab } from './EpTab';
import { ExportarTab } from './ExportarTab';
import { ResumenTab } from './ResumenTab';
import { TciTab } from './TciTab';
import { TriTab } from './TriTab';
import { TspTab } from './TspTab';

const ROLES = ['jefe', 'investigador'] as const;

const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'tri', label: 'TRI' },
  { value: 'tci', label: 'TCI' },
  { value: 'tsp', label: 'TSP' },
  { value: 'cfs', label: 'CFS' },
  { value: 'ep', label: 'EP' },
  { value: 'exportar', label: 'Exportar' },
] as const;

type TabId = (typeof TABS)[number]['value'];

/**
 * `Evidencia / Resumen` y anexos — Figma 2156:5682, 2163:4263, 2163:10456,
 * 2163:14157, 2163:17616 y 2163:18770. Los cinco instrumentos de la tesis con
 * sus KPI, fichas y exportación; la pestaña vive en `?tab=`.
 */
export function EvidenciaPage() {
  const { listo, permitido } = useRequireRole(ROLES);
  const router = useRouter();
  const params = useSearchParams();
  const exportar = useExportarEvidencia();

  const tab = ((params.get('tab') as TabId | null) ?? 'resumen') as TabId;
  const tabValida = TABS.some((t) => t.value === tab) ? tab : 'resumen';

  const resumen = useEvidenciaResumen();

  const cambiarTab = (valor: string) => {
    const siguiente = new URLSearchParams(params.toString());
    if (valor === 'resumen') siguiente.delete('tab');
    else siguiente.set('tab', valor);
    router.replace(`/evidencia${siguiente.size ? `?${siguiente}` : ''}`, { scroll: false });
  };

  const exportarSpss = async () => {
    try {
      const respuesta = await exportar.mutateAsync({
        kpis: ['TRI', 'TCI', 'TSP', 'CFS', 'EP'],
        formato: 'csv',
        destino: 'spss',
      });
      toast.success('Exportación para SPSS solicitada', {
        description: `Archivo ${respuesta.id} · CSV plano con codificación numérica de los 5 anexos.`,
      });
    } catch (e) {
      toast.error('No se pudo exportar para SPSS', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  const generarInforme = async () => {
    try {
      const respuesta = await exportar.mutateAsync({
        kpis: ['TRI', 'TCI', 'TSP', 'CFS', 'EP'],
        formato: 'xlsx',
        destino: 'informe',
      });
      toast.success('Informe en preparación', {
        description: `Archivo ${respuesta.id} · XLSX con una hoja por instrumento.`,
      });
    } catch (e) {
      toast.error('No se pudo generar el informe', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  if (!listo) return <PageSkeleton kpis={4} bloques={2} />;
  if (!permitido) return <Forbidden recurso="Evidencia de tesis" />;

  const periodos = resumen.data
    ? `Instrumentos de medición · Pretest ${formatDate(resumen.data.pretestDesde)} – ${formatDate(
        resumen.data.pretestHasta,
      )} · Postest ${formatDate(resumen.data.postestDesde)} – ${formatDate(resumen.data.postestHasta)}`
    : 'Instrumentos de medición · TRI, TCI, TSP, CFS y EP';

  return (
    <>
      <AppPageHeader
        title="Evidencia de tesis"
        subtitle={periodos}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Icon name="file-csv" />}
              onClick={exportarSpss}
              loading={exportar.isPending}
            >
              Exportar para SPSS
            </Button>
            {tabValida !== 'exportar' && (
              <Button variant="primary" onClick={generarInforme} loading={exportar.isPending}>
                Generar informe
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tabValida} onValueChange={cambiarTab} className="flex w-full flex-col">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen">
          {resumen.isPending ? (
            <AnexoSkeleton />
          ) : resumen.isError || !resumen.data ? (
            <AnexoError anexo="resumen de la tesis" onRetry={() => void resumen.refetch()} />
          ) : (
            <ResumenTab resumen={resumen.data} />
          )}
        </TabsContent>

        <TabsContent value="tri">{tabValida === 'tri' && <PanelTri />}</TabsContent>
        <TabsContent value="tci">{tabValida === 'tci' && <PanelTci />}</TabsContent>
        <TabsContent value="tsp">{tabValida === 'tsp' && <PanelTsp />}</TabsContent>
        <TabsContent value="cfs">{tabValida === 'cfs' && <PanelCfs />}</TabsContent>
        <TabsContent value="ep">{tabValida === 'ep' && <PanelEp />}</TabsContent>
        <TabsContent value="exportar">
          {tabValida === 'exportar' && (
            <ExportarTab kpis={resumen.data?.kpis ?? []} />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------------------------------------ Paneles por anexo */

function PanelTri() {
  const { data, isPending, isError, refetch } = useEvidenciaTri();
  if (isPending) return <AnexoSkeleton />;
  if (isError || !data) return <AnexoError anexo="Anexo 02 (TRI)" onRetry={() => void refetch()} />;
  return <TriTab tri={data} />;
}

function PanelTci() {
  const { data, isPending, isError, refetch } = useEvidenciaTci();
  if (isPending) return <AnexoSkeleton />;
  if (isError || !data) return <AnexoError anexo="Anexo 03 (TCI)" onRetry={() => void refetch()} />;
  return <TciTab tci={data} />;
}

function PanelTsp() {
  const { data, isPending, isError, refetch } = useEvidenciaTsp();
  if (isPending) return <AnexoSkeleton />;
  if (isError || !data) return <AnexoError anexo="Anexo 04 (TSP)" onRetry={() => void refetch()} />;
  return <TspTab tsp={data} />;
}

function PanelCfs() {
  const { data, isPending, isError, refetch } = useEvidenciaCfs();
  if (isPending) return <AnexoSkeleton />;
  if (isError || !data) return <AnexoError anexo="Anexo 05 (CFS)" onRetry={() => void refetch()} />;
  return <CfsTab cfs={data} />;
}

function PanelEp() {
  const { data, isPending, isError, refetch } = useEvidenciaEp();
  if (isPending) return <AnexoSkeleton />;
  if (isError || !data) return <AnexoError anexo="Anexo 06 (EP)" onRetry={() => void refetch()} />;
  return <EpTab ep={data} />;
}
