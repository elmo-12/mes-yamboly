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
import { KPIS_TESIS, type FormatoExport, type KpiTesisId, type KpiTesis } from '@mes/types';
import { useExportarEvidencia } from '../hooks';

interface ArchivoGenerado {
  id: string;
  estado: string;
  kpis: KpiTesisId[];
  formato: FormatoExport;
  solicitadoEn: string;
}

/**
 * Pestaña "Exportar" de Evidencia: selección de anexos, formato y generación
 * del paquete para SPSS / informe. La descarga la resuelve `/evidencia/exportar`.
 */
export function ExportarTab({ kpis }: { kpis: readonly KpiTesis[] }) {
  const exportar = useExportarEvidencia();
  const [seleccion, setSeleccion] = React.useState<KpiTesisId[]>([...KPIS_TESIS]);
  const [formato, setFormato] = React.useState<FormatoExport>('xlsx');
  const [archivos, setArchivos] = React.useState<ArchivoGenerado[]>([]);

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
        destino: formato === 'csv' ? 'spss' : 'informe',
      });
      setArchivos((prev) => [
        {
          id: respuesta.id,
          estado: respuesta.estado,
          kpis: [...seleccion],
          formato,
          solicitadoEn: new Date().toLocaleString('es-PE', {
            dateStyle: 'short',
            timeStyle: 'short',
          }),
        },
        ...prev,
      ]);
      toast.success('Exportación en preparación', {
        description: `${seleccion.length} instrumentos en ${formato.toUpperCase()}. Te avisamos cuando el archivo esté listo.`,
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
          <legend className="pb-2 text-body-md font-semibold text-text-primary">Formato</legend>
          <RadioGroup
            value={formato}
            onValueChange={(v) => setFormato(v as FormatoExport)}
            aria-label="Formato de exportación"
          >
            <Radio value="csv" label="CSV" supporting="Plano y codificado para SPSS" />
            <Radio value="xlsx" label="XLSX" supporting="Una hoja por anexo, con fórmulas" />
          </RadioGroup>
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
          description="Selecciona los instrumentos y el formato, y pulsa Generar para preparar el paquete de anexos."
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
            </tr>
          </THead>
          <TBody>
            {archivos.map((archivo) => (
              <TRow key={archivo.id} plain>
                <TCell className="font-medium">{archivo.id}</TCell>
                <TCell muted>{archivo.kpis.join(' · ')}</TCell>
                <TCell muted>{archivo.formato.toUpperCase()}</TCell>
                <TCell muted className="tabular">
                  {archivo.solicitadoEn}
                </TCell>
                <TCell>
                  <Badge color={archivo.estado === 'listo' ? 'success' : 'informational'}>
                    {archivo.estado === 'listo' ? 'Listo' : 'Generando'}
                  </Badge>
                </TCell>
              </TRow>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
