'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge, Input, Switch, Tag, toast } from '@mes/ui';
import { causaParadaSchema } from '@mes/types';
import type { CausaParada, CausaParadaInput, Linea } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { useBajaCausaParada, useGuardarCausaParada } from '@/features/catalogs/hooks';
import { CausaDetalleShell, EtiquetaCampo } from './CausaDetalleShell';

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

/** Panel de detalle del catálogo de causas de parada (Figma 2163:18282). */
export function CausaParadaDetalle({
  causa,
  padre,
  lineas,
  onEliminada,
}: CausaParadaDetalleProps) {
  const guardar = useGuardarCausaParada();
  const baja = useBajaCausaParada();

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
      codigoLegado: causa.codigoLegado ?? null,
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

  const programada = causa.clasificacion === 'programada';

  return (
    <CausaDetalleShell
      causa={causa}
      subtitulo={`${NIVEL_LABEL[causa.nivel]} · Parada ${programada ? 'planificada' : 'no planificada'} · ${formatNumber(causa.paradasHistoricas)} paradas históricas`}
      badges={
        <Badge color={programada ? 'neutral' : 'critical'}>
          {programada ? 'Planificada' : 'No planificada'}
        </Badge>
      }
      formId="form-causa-parada"
      onSubmit={onSubmit}
      estado={watch('estado')}
      onCambiarEstado={(estado) =>
        setValue('estado', estado, { shouldDirty: true, shouldValidate: true })
      }
      hayCambios={isDirty}
      guardando={isSubmitting}
      baja={{
        conservados: causa.paradasHistoricas,
        etiquetaConservados: 'paradas históricas',
        onConfirmar: (id) => baja.mutateAsync(id),
      }}
      onEliminada={onEliminada}
      items={[
        {
          label: <EtiquetaCampo titulo="Código" apoyo="Formato TT-GG-EE · no editable" />,
          value: <span className="font-medium tabular">{causa.codigo}</span>,
        },
        {
          label: (
            <EtiquetaCampo
              titulo="Código del sistema anterior"
              apoyo="Trazabilidad con el maestro legado (RUT04, FAL02…)"
            />
          ),
          value: (
            <span className="font-medium tabular text-text-secondary">
              {causa.codigoLegado ?? 'Sin código legado'}
            </span>
          ),
        },
        {
          label: (
            <EtiquetaCampo
              titulo="Nombre de la causa"
              apoyo="Visible para el maquinista al registrar"
            />
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
          label: (
            <EtiquetaCampo titulo="Nivel del catálogo" apoyo="Define dónde aparece en el árbol" />
          ),
          value: NIVEL_LABEL[causa.nivel],
        },
        {
          label: <EtiquetaCampo titulo="Categoría general" apoyo="Nodo padre en el árbol" />,
          value: padre ? `${padre.codigo} · ${padre.nombre}` : 'Sin categoría (nodo raíz)',
        },
        {
          label: (
            <EtiquetaCampo
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
            <EtiquetaCampo
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
            <EtiquetaCampo
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
            <EtiquetaCampo
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
            <EtiquetaCampo
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
          label: (
            <EtiquetaCampo
              titulo="Estado"
              apoyo="Las causas inactivas no aparecen al registrar"
            />
          ),
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
          label: (
            <EtiquetaCampo
              titulo="Paradas históricas"
              apoyo="Se conservan aunque se dé de baja"
            />
          ),
          value: `${formatNumber(causa.paradasHistoricas)} registros · última revisión ${formatDate(new Date())}`,
        },
      ]}
    />
  );
}
