'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  DescriptionList,
  Input,
  Switch,
  Tag,
  toast,
} from '@mes/ui';
import { causaParadaSchema } from '@mes/types';
import type { CausaParada, CausaParadaInput, Linea } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { useGuardarCausaParada } from '@/features/catalogs/hooks';
import { EliminarCausaModal } from './EliminarCausaModal';

const NIVEL_LABEL = {
  tipo: 'Tipo (nivel 1)',
  general: 'Categoría general (nivel 2)',
  especifica: 'Causa específica (nivel 3)',
} as const;

export interface CausaParadaDetalleProps {
  causa: CausaParada;
  /** Nodo padre para mostrar la categoría general. */
  padre?: CausaParada;
  lineas: readonly Linea[];
  onEliminada: () => void;
}

/**
 * Panel de detalle del catálogo de causas (Figma 2163:18282): patrón Settings
 * — filas label/valor con divisores, Toggle para los cambios instantáneos y
 * botonera Secondary "Desactivar" + Primary "Guardar cambios".
 */
export function CausaParadaDetalle({
  causa,
  padre,
  lineas,
  onEliminada,
}: CausaParadaDetalleProps) {
  const guardar = useGuardarCausaParada();
  const [confirmarBaja, setConfirmarBaja] = React.useState(false);

  const valoresIniciales = React.useMemo<CausaParadaInput>(
    () => ({
      codigo: causa.codigo,
      nombre: causa.nombre,
      nivel: causa.nivel,
      parentId: causa.parentId,
      clasificacion: causa.clasificacion,
      afectaOee: causa.afectaOee,
      requiereEvidencia: causa.requiereEvidencia,
      requiereSolicitud: causa.requiereSolicitud,
      tiempoEstandarMin: causa.tiempoEstandarMin,
      lineasAplicables: causa.lineasAplicables,
      estado: causa.estado,
    }),
    [causa],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CausaParadaInput>({
    resolver: zodResolver(causaParadaSchema),
    values: valoresIniciales,
  });

  const onSubmit = handleSubmit(async (valores) => {
    try {
      await guardar.mutateAsync({ id: causa.id, input: valores });
      reset(valores);
      toast.success(`Causa ${valores.codigo} actualizada`, {
        description: 'El cambio aplica a los próximos registros de parada.',
      });
    } catch (error) {
      toast.error('No se pudo guardar la causa', {
        description: error instanceof Error ? error.message : 'Revisa los campos.',
      });
    }
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-h3 text-text-primary">{`${causa.codigo} · ${causa.nombre}`}</h2>
          <p className="text-body-sm text-text-secondary">
            {`${NIVEL_LABEL[causa.nivel]} · Parada ${causa.clasificacion === 'programada' ? 'planificada' : 'no planificada'} · ${formatNumber(causa.paradasHistoricas)} paradas históricas`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge color={causa.clasificacion === 'programada' ? 'neutral' : 'critical'}>
            {causa.clasificacion === 'programada' ? 'Planificada' : 'No planificada'}
          </Badge>
          <Badge color={causa.estado === 'activo' ? 'success' : 'neutral'}>
            {causa.estado === 'activo' ? 'Activa' : 'Inactiva'}
          </Badge>
        </div>
      </header>

      <form id="form-causa-parada" onSubmit={onSubmit} noValidate>
        <DescriptionList
          labelWidth={260}
          items={[
            {
              label: (
                <Etiqueta titulo="Código" apoyo="Formato TT-GG-EE · no editable" />
              ),
              value: <span className="font-medium tabular">{causa.codigo}</span>,
            },
            {
              label: (
                <Etiqueta titulo="Nombre de la causa" apoyo="Visible para el maquinista al registrar" />
              ),
              value: (
                <Input
                  aria-label="Nombre de la causa"
                  {...register('nombre')}
                  destructive={Boolean(errors.nombre)}
                  hint={errors.nombre?.message}
                />
              ),
            },
            {
              label: <Etiqueta titulo="Nivel del catálogo" apoyo="Define dónde aparece en el árbol" />,
              value: NIVEL_LABEL[causa.nivel],
            },
            {
              label: <Etiqueta titulo="Categoría general" apoyo="Nodo padre en el árbol" />,
              value: padre ? `${padre.codigo} · ${padre.nombre}` : 'Sin categoría (nodo raíz)',
            },
            {
              label: (
                <Etiqueta
                  titulo="Afecta al OEE"
                  apoyo="Descuenta del tiempo disponible en el cálculo de OEE"
                />
              ),
              value: (
                <Controller
                  control={control}
                  name="afectaOee"
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      label={field.value ? 'Activado' : 'Desactivado'}
                    />
                  )}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Requiere evidencia"
                  apoyo="Foto del equipo o parte de mantenimiento adjunto"
                />
              ),
              value: (
                <Controller
                  control={control}
                  name="requiereEvidencia"
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      label={field.value ? 'Activado' : 'Desactivado'}
                    />
                  )}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Requiere N° de solicitud"
                  apoyo="Orden de trabajo del CMMS al registrar la parada"
                />
              ),
              value: (
                <Controller
                  control={control}
                  name="requiereSolicitud"
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      label={field.value ? 'Activado' : 'Desactivado'}
                    />
                  )}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Tiempo estándar de atención"
                  apoyo="Usado como referencia en las alertas"
                />
              ),
              value: (
                <Input
                  aria-label="Tiempo estándar en minutos"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  suffix="min"
                  className="max-w-[180px]"
                  wrapperClassName="max-w-[180px]"
                  {...register('tiempoEstandarMin')}
                  destructive={Boolean(errors.tiempoEstandarMin)}
                  hint={errors.tiempoEstandarMin?.message}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Líneas aplicables"
                  apoyo="Solo estas líneas la ven en el registro; vacío = todas"
                />
              ),
              value: (
                <Controller
                  control={control}
                  name="lineasAplicables"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {lineas.map((l) => {
                        const activa = field.value.includes(l.id);
                        return (
                          <Tag
                            key={l.id}
                            size="md"
                            selected={activa}
                            onClick={() =>
                              field.onChange(
                                activa
                                  ? field.value.filter((id) => id !== l.id)
                                  : [...field.value, l.id],
                              )
                            }
                          >
                            {`${l.codigo} · ${l.nombre}`}
                          </Tag>
                        );
                      })}
                    </div>
                  )}
                />
              ),
            },
            {
              label: <Etiqueta titulo="Estado" apoyo="Las causas inactivas no aparecen al registrar" />,
              value: (
                <Controller
                  control={control}
                  name="estado"
                  render={({ field }) => (
                    <Switch
                      checked={field.value === 'activo'}
                      onCheckedChange={(v) => field.onChange(v ? 'activo' : 'inactivo')}
                      label={field.value === 'activo' ? 'Activa' : 'Inactiva'}
                    />
                  )}
                />
              ),
            },
            {
              label: <Etiqueta titulo="Paradas históricas" apoyo="Se conservan aunque se dé de baja" />,
              value: `${formatNumber(causa.paradasHistoricas)} registros · última revisión ${formatDate(new Date())}`,
            },
          ]}
        />
      </form>

      {/* Figma 2163:18282: la acción destructiva va a la izquierda, separada
          del par Secundario/Primario, y siempre pasa por el modal Danger. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="danger" className="mr-auto" onClick={() => setConfirmarBaja(true)}>
          Eliminar causa
        </Button>
        <Button
          variant="secondary"
          disabled={watch('estado') !== 'activo'}
          onClick={() =>
            setValue('estado', 'inactivo', { shouldDirty: true, shouldValidate: true })
          }
        >
          Desactivar
        </Button>
        <Button
          variant="primary"
          type="submit"
          form="form-causa-parada"
          disabled={!isDirty}
          loading={isSubmitting}
        >
          Guardar cambios
        </Button>
      </div>

      <EliminarCausaModal
        open={confirmarBaja}
        onOpenChange={setConfirmarBaja}
        causa={causa}
        onEliminada={onEliminada}
      />
    </div>
  );
}

function Etiqueta({ titulo, apoyo }: { titulo: string; apoyo: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-body text-text-primary">{titulo}</span>
      <span className="text-body-sm text-text-secondary">{apoyo}</span>
    </span>
  );
}
