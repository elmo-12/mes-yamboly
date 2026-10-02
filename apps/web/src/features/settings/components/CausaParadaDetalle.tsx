'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge, Input, Select, Switch, Tag, toast } from '@mes/ui';
import { causaParadaSchema } from '@mes/types';
import type { CausaParada, CausaParadaInput, Linea } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { esConflictoVersion, TOAST_CONFLICTO_VERSION } from '@/features/catalogs/errores';
import { useBajaCausaParada, useGuardarCausaParada } from '@/features/catalogs/hooks';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { CausaDetalleShell, EtiquetaCampo } from './CausaDetalleShell';

/** Campos editables: código, nivel y padre son inmutables (definen id y posición). */
const formSchema = causaParadaSchema.omit({ codigo: true, nivel: true, parentId: true });
type FormValores = Omit<CausaParadaInput, 'codigo' | 'nivel' | 'parentId'>;

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

  /* Código, nivel y padre son inmutables (definen el id y la posición en el
     árbol): no forman parte del formulario ni del PATCH. */
  const valoresIniciales = React.useMemo<FormValores>(
    () => ({
      nombre: causa.nombre,
      clasificacion: causa.clasificacion,
      afectaOee: causa.afectaOee,
      requiereEvidencia: causa.requiereEvidencia,
      requiereSolicitud: causa.requiereSolicitud,
      tiempoEstandarMin: causa.tiempoEstandarMin,
      lineasAplicables: causa.lineasAplicables,
      estado: causa.estado,
      /* Trazabilidad interna con el maestro legado: se conserva al guardar,
         pero ya no se muestra en la ficha. */
      codigoLegado: causa.codigoLegado ?? null,
      version: causa.version,
    }),
    [causa],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValores>({
    resolver: zodResolver(formSchema),
    values: valoresIniciales,
  });

  const onSubmit = handleSubmit(async (valores) => {
    try {
      const guardada = await guardar.mutateAsync({
        id: causa.id,
        input: valores as CausaParadaInput,
      });
      reset({ ...valores, version: guardada.version });
      toast.success(`Causa ${causa.codigo} actualizada`, {
        description:
          causa.nivel === 'tipo' && valores.clasificacion !== causa.clasificacion
            ? 'La clasificación se aplicó también a todas sus causas.'
            : 'El cambio aplica a los próximos registros de parada.',
      });
    } catch (error) {
      if (esConflictoVersion(error)) {
        toast.error(TOAST_CONFLICTO_VERSION.titulo, { description: TOAST_CONFLICTO_VERSION.descripcion });
        return;
      }
      if (aplicarErroresApi<FormValores>(error, setError).length > 0) {
        toast.error('Revisa los campos marcados', { description: 'La causa no se guardó.' });
        return;
      }
      toast.error('No se pudo guardar la causa', {
        description: mensajeDeError(error, 'Revisa los campos.'),
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
              titulo="Clasificación"
              apoyo={
                causa.nivel === 'tipo'
                  ? 'Se aplica a todas las causas de este tipo'
                  : 'Heredada del tipo raíz; cámbiala en el tipo'
              }
            />
          ),
          value:
            causa.nivel === 'tipo' ? (
              <Controller
                control={control}
                name="clasificacion"
                render={({ field }) => (
                  <Select

                    options={[
                      { value: 'imprevista', label: 'No planificada (imprevista)' },
                      { value: 'programada', label: 'Planificada (programada)' },
                    ]}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                )}
              />
            ) : programada ? (
              'Planificada (programada)'
            ) : (
              'No planificada (imprevista)'
            ),
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
                  {lineas
                    .filter((l) => l.estado === 'activo' || field.value.includes(l.id))
                    .map((l) => {
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
          value: `${formatNumber(causa.paradasHistoricas)} registros`,
        },
      ]}
    />
  );
}
