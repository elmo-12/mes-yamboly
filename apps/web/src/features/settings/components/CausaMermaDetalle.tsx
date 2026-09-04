'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input, Switch, Tag, toast } from '@mes/ui';
import { NIVEL_CAUSA_MERMA_LABEL, TIPOS_MERMA, TIPO_MERMA_LABEL, causaMermaSchema } from '@mes/types';
import type { CausaMerma, CausaMermaInput, Linea } from '@mes/types';
import { formatDate, formatNumber } from '@mes/shared';
import { useBajaCausaMerma, useGuardarCausaMerma } from '@/features/catalogs/hooks';
import { CausaDetalleShell, EtiquetaCampo } from './CausaDetalleShell';

const NIVEL_ORDINAL = {
  tipo: 'Tipo de producción (nivel 1)',
  clasificacion: 'Clasificación (nivel 2)',
  causa: 'Causa (nivel 3)',
} as const;

export interface CausaMermaDetalleProps {
  causa: CausaMerma;
  /** Nodo padre (tipo o clasificación) para mostrar el camino del árbol. */
  padre?: CausaMerma;
  lineas: readonly Linea[];
  onEliminada: () => void;
}

/**
 * Panel de detalle del catálogo de causas de merma. Misma estructura que el de
 * paradas (Figma 2163:18282) mediante `CausaDetalleShell`, con los campos
 * propios del árbol tipo → clasificación → causa.
 */
export function CausaMermaDetalle({ causa, padre, lineas, onEliminada }: CausaMermaDetalleProps) {
  const guardar = useGuardarCausaMerma();
  const baja = useBajaCausaMerma();

  const valoresIniciales = React.useMemo<CausaMermaInput>(
    () => ({
      codigo: causa.codigo,
      nombre: causa.nombre,
      nivel: causa.nivel,
      parentId: causa.parentId,
      aplicaA: causa.aplicaA,
      lineasAplicables: causa.lineasAplicables,
      requiereEvidencia: causa.requiereEvidencia,
      requiereComentario: causa.requiereComentario,
      requiereSolicitud: causa.requiereSolicitud,
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
  } = useForm<CausaMermaInput>({
    resolver: zodResolver(causaMermaSchema),
    values: valoresIniciales,
  });

  const onSubmit = handleSubmit(async (valores) => {
    try {
      await guardar.mutateAsync({ id: causa.id, input: valores });
      reset(valores);
      toast.success(`Causa ${valores.codigo} actualizada`, {
        description: 'El cambio aplica a los próximos registros de merma.',
      });
    } catch (error) {
      toast.error('No se pudo guardar la causa', {
        description: error instanceof Error ? error.message : 'Revisa los campos.',
      });
    }
  });

  return (
    <CausaDetalleShell
      causa={causa}
      subtitulo={`${NIVEL_ORDINAL[causa.nivel]} · ${formatNumber(causa.mermasHistoricas)} mermas históricas`}
      formId="form-causa-merma"
      onSubmit={onSubmit}
      estado={watch('estado')}
      onCambiarEstado={(estado) =>
        setValue('estado', estado, { shouldDirty: true, shouldValidate: true })
      }
      hayCambios={isDirty}
      guardando={isSubmitting}
      baja={{
        conservados: causa.mermasHistoricas,
        etiquetaConservados: 'mermas históricas',
        onConfirmar: (id) => baja.mutateAsync(id),
      }}
      onEliminada={onEliminada}
      items={[
        {
          label: <EtiquetaCampo titulo="Código" apoyo="Formato MP-01 · MP-01-A · MP-01-01" />,
          value: <span className="font-medium tabular">{causa.codigo}</span>,
        },
        {
          label: (
            <EtiquetaCampo
              titulo="Nombre de la causa"
              apoyo="Visible para el encargado de merma al registrar"
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
          value: `${NIVEL_CAUSA_MERMA_LABEL[causa.nivel]} · ${NIVEL_ORDINAL[causa.nivel]}`,
        },
        {
          label: <EtiquetaCampo titulo="Nodo padre" apoyo="Tipo o clasificación de la que cuelga" />,
          value: padre ? `${padre.codigo} · ${padre.nombre}` : 'Sin padre (nodo raíz)',
        },
        {
          label: (
            <EtiquetaCampo
              titulo="Tipos de merma donde aplica"
              apoyo="MP materia prima · EP en proceso · PT producto terminado"
            />
          ),
          value: (
            <Controller
              control={control}
              name="aplicaA"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {TIPOS_MERMA.map((t) => {
                    const activa = field.value.includes(t);
                    return (
                      <Tag
                        key={t}
                        size="md"
                        selected={activa}
                        onClick={() =>
                          field.onChange(
                            activa ? field.value.filter((x) => x !== t) : [...field.value, t],
                          )
                        }
                      >
                        {`${t} · ${TIPO_MERMA_LABEL[t]}`}
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
              titulo="Requiere evidencia"
              apoyo="Foto del producto descartado al registrar la merma"
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
              titulo="Requiere comentario"
              apoyo="Obliga a describir el motivo en el registro"
            />
          ),
          value: (
            <Controller
              control={control}
              name="requiereComentario"
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
              apoyo="Número de solicitud del área que autoriza la baja"
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
              titulo="Mermas históricas"
              apoyo="Se conservan aunque se dé de baja"
            />
          ),
          value: `${formatNumber(causa.mermasHistoricas)} registros · última revisión ${formatDate(new Date())}`,
        },
      ]}
    />
  );
}
