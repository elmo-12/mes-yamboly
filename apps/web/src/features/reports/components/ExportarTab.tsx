'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Icon,
  Input,
  Overline,
  Radio,
  RadioGroup,
  SectionTitle,
  Spinner,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  toast,
} from '@mes/ui';
import type { DatasetExport, ExportJob, ExportRequestInput, FormatoExport } from '@mes/types';
import {
  DATASETS_EXPORT,
  DATASET_EXPORT_LABEL,
  FORMATOS_EXPORT,
  exportRequestSchema,
} from '@mes/types';
import { formatDate, formatDateTime, formatNumber } from '@mes/shared';
import { descargarArchivo } from '@/services/api/client';
import { mensajeDeError } from '@/services/api/form-errors';
import { useExportaciones, useExportar } from '../hooks';
import { TabError } from './estados';

export interface ExportarTabProps {
  /** Rango vigente en la barra de filtros; precarga el formulario. */
  desde: string;
  hasta: string;
}

const DATASET_AYUDA: Record<DatasetExport, string> = {
  ordenes: 'Producción por línea, turno y producto (RF2)',
  paradas: 'Causa codificada, duración y responsable (RF3)',
  mermas: 'Tipo MP/EP/PT, causa y costo estimado (RF4)',
  velocidades: 'Muestreo de velocidad de línea (RF6)',
  indicadores: 'OEE con disponibilidad, desempeño y calidad (RF7)',
  alertas: 'Severidad, destinatario y tiempo de atención (RF9)',
  evidencia: 'Mediciones TRI y TCI para la tesis (RF14–RF17)',
};

const FORMATO_AYUDA: Record<FormatoExport, { label: string; ayuda: string }> = {
  xlsx: { label: 'XLSX', ayuda: 'Una hoja por conjunto, con formato y totales' },
  csv: { label: 'CSV', ayuda: 'Un archivo plano por conjunto, UTF-8' },
  pdf: { label: 'PDF', ayuda: 'Reporte con gráficos, listo para imprimir' },
};

const ESTADO_BADGE = {
  listo: { color: 'success' as const, label: 'Listo' },
  generando: { color: 'warning' as const, label: 'Generando' },
  error: { color: 'critical' as const, label: 'Error' },
};

/** `Reportes / Exportar` (Figma 2163:19635) — RF13, trazabilidad del archivo. */
export function ExportarTab({ desde, hasta }: ExportarTabProps) {
  const historial = useExportaciones();
  const exportar = useExportar();

  /* El archivo se pide con `fetch` para poder enviar el token; un `<a download>`
     no admite cabeceras. Ver `descargarArchivo`. */
  const descargar = async (job: ExportJob) => {
    if (!job.url) return;
    try {
      await descargarArchivo(job.url, `${job.nombre}.${job.formato}`);
    } catch (error) {
      toast.error('No se pudo descargar el archivo', {
        description: mensajeDeError(error, 'El archivo ya no está disponible en el servidor.'),
      });
    }
  };

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ExportRequestInput>({
    resolver: zodResolver(exportRequestSchema),
    defaultValues: {
      datasets: ['ordenes', 'paradas', 'mermas', 'indicadores', 'evidencia'],
      formato: 'xlsx',
      desde,
      hasta,
    },
  });

  const datasets = watch('datasets');
  const formato = watch('formato');

  const alternar = (d: DatasetExport) => {
    setValue(
      'datasets',
      datasets.includes(d) ? datasets.filter((x) => x !== d) : [...datasets, d],
      { shouldValidate: true },
    );
  };

  const onSubmit = handleSubmit((valores) => {
    exportar.mutate(valores, {
      onSuccess: (job) => {
        toast.success('Exportación en curso', {
          description: `${job.nombre} · el archivo aparecerá en el historial al terminar.`,
        });
      },
      onError: () =>
        toast.error('No se pudo generar el archivo', {
          description: 'Revisa la selección e inténtalo de nuevo.',
        }),
    });
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Configurar exportación"
        description="Selecciona los conjuntos de datos, el formato y el rango. El archivo queda registrado en el historial como evidencia (RF13)."
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-4">
        <fieldset className="flex min-w-0 flex-1 flex-col gap-4 rounded-md border border-border p-4">
          <legend className="sr-only">Conjuntos de datos</legend>
          <div className="flex flex-col gap-1">
            <h3 className="text-h4 text-text-primary">Conjuntos de datos</h3>
            <p className="text-body-sm text-text-secondary">
              {formatNumber(datasets.length)} de {DATASETS_EXPORT.length} conjuntos seleccionados
            </p>
          </div>
          <div className="flex flex-col gap-3.5">
            {DATASETS_EXPORT.map((d) => (
              <Checkbox
                key={d}
                checked={datasets.includes(d)}
                onCheckedChange={() => alternar(d)}
                label={DATASET_EXPORT_LABEL[d]}
                supporting={DATASET_AYUDA[d]}
              />
            ))}
          </div>
          {errors.datasets && (
            <p className="text-body-sm text-error-text">{errors.datasets.message}</p>
          )}
          <div className="flex items-center gap-2 text-body-sm">
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setValue('datasets', [...DATASETS_EXPORT], { shouldValidate: true })}
            >
              Seleccionar todos
            </button>
            <span className="text-text-disabled">·</span>
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setValue('datasets', [], { shouldValidate: true })}
            >
              Quitar selección
            </button>
          </div>
        </fieldset>

        <div className="flex w-full flex-col gap-4 rounded-md border border-border p-4 lg:max-w-[380px]">
          <div className="flex flex-col gap-1">
            <h3 className="text-h4 text-text-primary">Formato y entrega</h3>
            <p className="text-body-sm text-text-secondary">Define el archivo y el rango de fechas</p>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2">
              <Overline>Formato de archivo</Overline>
            </legend>
            <Controller
              control={control}
              name="formato"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange}>
                  {FORMATOS_EXPORT.map((f) => (
                    <Radio
                      key={f}
                      value={f}
                      label={FORMATO_AYUDA[f].label}
                      supporting={FORMATO_AYUDA[f].ayuda}
                    />
                  ))}
                </RadioGroup>
              )}
            />
          </fieldset>

          <Divider />

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2">
              <Overline>Rango</Overline>
            </legend>
            <div className="flex gap-3">
              <Controller
                control={control}
                name="desde"
                render={({ field }) => (
                  <Input
                    type="date"
                    size="sm"
                    label="Desde"
                    {...field}
                    destructive={Boolean(errors.desde)}
                    hint={errors.desde?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="hasta"
                render={({ field }) => (
                  <Input
                    type="date"
                    size="sm"
                    label="Hasta"
                    {...field}
                    destructive={Boolean(errors.hasta)}
                    hint={errors.hasta?.message}
                  />
                )}
              />
            </div>
          </fieldset>

          <Divider />

          <p className="rounded-sm bg-background-subtle px-2.5 py-1.5 text-body-sm font-medium text-neutral-text">
            {formatNumber(datasets.length)} conjuntos · {FORMATO_AYUDA[formato].label} ·{' '}
            {formatDate(watch('desde'))} – {formatDate(watch('hasta'))}
          </p>

          <Button
            type="submit"
            variant="primary"
            block
            loading={exportar.isPending}
            disabled={exportar.isPending || datasets.length === 0}
            icon={<Icon name="file-export" />}
          >
            Generar archivo
          </Button>
        </div>
      </form>

      <SectionTitle
        title="Historial de exportaciones"
        description="Registro auditable de los archivos generados. Sirve como evidencia del repositorio digital (RF5) y de la trazabilidad (RF13)."
      />

      {historial.isError ? (
        <TabError onReintentar={() => void historial.refetch()} />
      ) : (
        <Table density="dense">
          <THead>
            <TRow plain>
              <TH>Fecha</TH>
              <TH>Archivo</TH>
              <TH numeric>Conjuntos</TH>
              <TH>Formato</TH>
              <TH numeric>Tamaño</TH>
              <TH>Estado</TH>
              <TH>Generado por</TH>
              <TH>Acción</TH>
            </TRow>
          </THead>
          <TBody>
            {(historial.data?.data ?? []).map((job) => {
              const badge = ESTADO_BADGE[job.estado];
              return (
                <TRow key={job.id}>
                  <TCell muted className="tabular whitespace-nowrap">
                    {formatDateTime(job.solicitadoEn)}
                  </TCell>
                  <TCell className="font-medium">{job.nombre}</TCell>
                  <TCell numeric muted>
                    {formatNumber(job.datasets.length)}
                  </TCell>
                  <TCell className="uppercase">{job.formato}</TCell>
                  <TCell numeric muted>
                    {job.tamano ?? '—'}
                  </TCell>
                  <TCell>
                    <span className="flex items-center gap-2">
                      {job.estado === 'generando' && <Spinner className="text-warning" />}
                      <Badge color={badge.color} dot={job.estado !== 'generando'}>
                        {badge.label}
                      </Badge>
                    </span>
                  </TCell>
                  <TCell muted>{job.solicitadoPor}</TCell>
                  <TCell>
                    {job.estado === 'listo' && job.url ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Icon name="download" size={16} />}
                        onClick={() => void descargar(job)}
                      >
                        Descargar
                      </Button>
                    ) : (
                      <span className="text-body-sm text-text-disabled">—</span>
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
