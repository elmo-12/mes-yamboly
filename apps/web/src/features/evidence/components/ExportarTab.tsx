'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Icon,
  Radio,
  RadioGroup,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  toast,
} from '@mes/ui';
import { KPIS_TESIS, type ExportJob, type FormatoExport, type KpiTesisId, type KpiTesis } from '@mes/types';
import { formatDateTime } from '@mes/shared';
import { useExportaciones } from '@/features/reports/hooks';
import { descargarArchivo } from '@/services/api/client';
import { mensajeDeError } from '@/services/api/form-errors';
import { useExportarEvidencia } from '../hooks';

/** Nombre que pone la API a los paquetes de evidencia: `Evidencia TRI, TCI · SPSS`. */
const NOMBRE_EVIDENCIA = /^Evidencia (.+) · (SPSS|informe)$/;

const ESTADO_BADGE: Record<ExportJob['estado'], { label: string; color: 'success' | 'informational' | 'critical' }> = {
  listo: { label: 'Listo', color: 'success' },
  generando: { label: 'Generando', color: 'informational' },
  error: { label: 'Error', color: 'critical' },
};

/**
 * Pestaña "Exportar" de Evidencia: selección de anexos, formato y generación
 * del paquete para SPSS / informe. La descarga la resuelve `/evidencia/exportar`.
 */
export function ExportarTab({ kpis }: { kpis: readonly KpiTesis[] }) {
  const exportar = useExportarEvidencia();
  const [seleccion, setSeleccion] = React.useState<KpiTesisId[]>([...KPIS_TESIS]);
  /* El único formato que el generador escribe es XLSX; lo que sí decide el
     usuario es el destino, que cambia cómo se codifican los booleanos. */
  const formato: FormatoExport = 'xlsx';
  const [destino, setDestino] = React.useState<'spss' | 'informe'>('spss');
  /* El historial vive en el servidor (sobrevive a recargas) y se sondea cada
     2 s mientras haya algún archivo «generando». */
  const historial = useExportaciones();
  const archivos = (historial.data?.data ?? []).filter(
    (job) => job.datasets.includes('evidencia') && NOMBRE_EVIDENCIA.test(job.nombre),
  );

  const descargar = async (job: ExportJob) => {
    if (!job.url) return;
    try {
      await descargarArchivo(job.url, `${job.id} ${job.nombre}.${job.formato}`);
    } catch (error) {
      toast.error('No se pudo descargar el archivo', {
        description: mensajeDeError(error, 'El archivo ya no está disponible en el servidor.'),
      });
    }
  };

  const anexoDe = (id: KpiTesisId) => kpis.find((k) => k.id === id)?.anexo ?? '';
  const nombreDe = (id: KpiTesisId) => kpis.find((k) => k.id === id)?.nombre ?? id;

  const alternar = (id: KpiTesisId, marcado: boolean) =>
    setSeleccion((prev) => (marcado ? [...new Set([...prev, id])] : prev.filter((k) => k !== id)));

  const generar = async () => {
    if (seleccion.length === 0) {
      toast.warning('Selecciona al menos un instrumento');
      return;
    }
    try {
      const respuesta = await exportar.mutateAsync({
        kpis: seleccion,
        formato,
        destino,
      });
      toast.success('Exportación en preparación', {
        description: `${respuesta.id} · ${seleccion.length} instrumentos en XLSX para ${destino === 'spss' ? 'SPSS' : 'informe'}. Aparecerá como «Listo» en la tabla para descargarlo.`,
      });
    } catch (e) {
      toast.error('No se pudo generar la exportación', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Exportar instrumentos de la tesis"
        description="Genera el paquete de anexos para el análisis estadístico (SPSS) o para el informe final."
        className="border-b border-divider pb-3"
      />

      <div className="flex flex-col gap-5 md:flex-row md:gap-12">
        <fieldset className="flex min-w-0 flex-1 flex-col gap-3">
          <legend className="pb-2 text-body-md font-semibold text-text-primary">
            Instrumentos a incluir
          </legend>
          {KPIS_TESIS.map((id) => (
            <Checkbox
              key={id}
              size="sm"
              checked={seleccion.includes(id)}
              onCheckedChange={(valor) => alternar(id, valor === true)}
              label={`${anexoDe(id)} · ${id} — ${nombreDe(id)}`}
            />
          ))}
        </fieldset>

        <fieldset className="flex shrink-0 flex-col gap-3 md:w-72">
          <legend className="pb-2 text-body-md font-semibold text-text-primary">Destino</legend>
          <RadioGroup
            value={destino}
            onValueChange={(v) => setDestino(v as 'spss' | 'informe')}
            aria-label="Destino de la exportación"
          >
            <Radio value="spss" label="SPSS" supporting="Booleanos como 1/0, listo para importar" />
            <Radio value="informe" label="Informe" supporting="Booleanos como Sí/No, para leer" />
          </RadioGroup>
          <p className="text-body-sm text-text-secondary">
            Una hoja por anexo en XLSX.
          </p>
          <div className="pt-2">
            <Button variant="primary" onClick={generar} loading={exportar.isPending}>
              Generar
            </Button>
          </div>
        </fieldset>
      </div>

      <SectionTitle
        title="Archivos generados"
        description="Las exportaciones quedan disponibles durante 7 días."
        className="border-b border-divider pb-3"
      />

      {archivos.length === 0 ? (
        <EmptyState
          icon={<Icon name="file-export" size={40} />}
          title="Todavía no generaste archivos"
          description="Selecciona los instrumentos y el destino, y pulsa Generar para preparar el paquete de anexos."
        />
      ) : (
        <Table density="dense">
          <THead>
            <tr>
              <TH className="w-40">Archivo</TH>
              <TH>Instrumentos</TH>
              <TH className="w-25">Formato</TH>
              <TH className="w-40">Solicitado</TH>
              <TH className="w-30">Estado</TH>
              <TH className="w-30">Descarga</TH>
            </tr>
          </THead>
          <TBody>
            {archivos.map((archivo) => {
              const estado = ESTADO_BADGE[archivo.estado];
              return (
                <TRow key={archivo.id} plain>
                  <TCell className="font-medium">{archivo.id}</TCell>
                  <TCell muted>{NOMBRE_EVIDENCIA.exec(archivo.nombre)?.[1]?.split(', ').join(' · ')}</TCell>
                  <TCell muted>{archivo.formato.toUpperCase()}</TCell>
                  <TCell muted className="tabular">
                    {formatDateTime(archivo.solicitadoEn)}
                  </TCell>
                  <TCell>
                    <Badge color={estado.color}>{estado.label}</Badge>
                  </TCell>
                  <TCell>
                    {archivo.estado === 'listo' && archivo.url ? (
                      <Button variant="link" size="sm" onClick={() => void descargar(archivo)}>
                        Descargar
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TCell>
                </TRow>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
