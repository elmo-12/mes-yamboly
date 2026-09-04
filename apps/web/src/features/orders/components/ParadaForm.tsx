'use client';

import * as React from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Input, Select, Switch, Textarea } from '@mes/ui';
import type { CausaParadaNodo, ParadaListItem } from '@mes/types';
import { useUsuarios } from '@/features/catalogs/hooks';
import { especificasDeTipo } from '@/features/catalogs/causas';
import { hora } from '../format';

/**
 * Campos de parada de la spec 04.B, reutilizados por "Registrar parada
 * retroactiva" y por el drawer "Editar parada" (Figma 2163:14623).
 * El wizard de captura rápida es de V2: aquí solo vive el formulario.
 */
export const paradaFormSchema = z
  .object({
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm'),
    horaFin: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Formato HH:mm')
      .or(z.literal('')),
    tipoCausaId: z.string().min(1, 'Selecciona el tipo de parada'),
    causaId: z.string().min(1, 'Selecciona la causa específica'),
    accionTomada: z
      .string()
      .min(10, 'Describe la acción tomada (mínimo 10 caracteres)')
      .max(300, 'Máximo 300 caracteres'),
    numeroSolicitud: z.string().max(40, 'Máximo 40 caracteres').optional(),
    responsableId: z.string().min(1, 'Selecciona un responsable'),
    afectaOee: z.boolean(),
  })
  .refine((v) => !v.horaFin || v.horaFin > v.horaInicio, {
    message: 'La hora de fin debe ser posterior a la de inicio',
    path: ['horaFin'],
  });

export type ParadaFormValues = z.infer<typeof paradaFormSchema>;

/** Valores iniciales a partir de una parada existente (drawer de edición). */
export function valoresDeParada(parada: ParadaListItem): ParadaFormValues {
  return {
    horaInicio: hora(parada.inicio),
    horaFin: parada.fin ? hora(parada.fin) : '',
    tipoCausaId: parada.tipoCausaId,
    causaId: parada.causaId,
    accionTomada: parada.accionTomada,
    numeroSolicitud: parada.numeroSolicitud ?? '',
    responsableId: parada.responsableId,
    afectaOee: parada.afectaOee,
  };
}

/** `07:42` + fecha de la OF → `2026-08-28T07:42:00`. */
export function aIso(fecha: string, hhmm: string): string {
  return `${fecha}T${hhmm}:00`;
}

/** Minutos entre dos `HH:mm` del mismo turno. */
export function duracionMin(inicio: string, fin: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) return null;
  const [hi = '0', mi = '0'] = inicio.split(':');
  const [hf = '0', mf = '0'] = fin.split(':');
  const minutos = Number(hf) * 60 + Number(mf) - (Number(hi) * 60 + Number(mi));
  return minutos > 0 ? minutos : null;
}

export interface ParadaFormProps {
  form: UseFormReturn<ParadaFormValues>;
  causas?: readonly CausaParadaNodo[];
  formId: string;
  onSubmit: (valores: ParadaFormValues) => void | Promise<void>;
}

export function ParadaForm({ form, causas = [], formId, onSubmit }: ParadaFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const { data: usuarios } = useUsuarios();

  const tipoCausaId = watch('tipoCausaId');
  const horaInicio = watch('horaInicio');
  const horaFin = watch('horaFin');
  const causaId = watch('causaId');

  const tipos = React.useMemo(
    () => causas.filter((c) => c.estado === 'activo').map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` })),
    [causas],
  );

  const especificas = React.useMemo(
    () =>
      tipoCausaId
        ? especificasDeTipo(causas, tipoCausaId).map((c) => ({
            value: c.id,
            label: `${c.codigo} · ${c.nombre}`,
          }))
        : [],
    [causas, tipoCausaId],
  );

  /* Al cambiar el tipo, la causa específica anterior deja de ser válida. */
  React.useEffect(() => {
    if (!tipoCausaId || !causaId) return;
    if (!especificas.some((o) => o.value === causaId)) setValue('causaId', '');
  }, [causaId, especificas, setValue, tipoCausaId]);

  const minutos = duracionMin(horaInicio, horaFin);

  const opcionesResponsable = (usuarios?.data ?? [])
    .filter((u) => u.activo)
    .map((u) => ({ value: u.id, label: `${u.nombre} · ${u.cargo}` }));

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Hora inicio"
          type="time"
          {...register('horaInicio')}
          destructive={Boolean(errors.horaInicio)}
          hint={errors.horaInicio?.message}
        />
        <Input
          label="Hora fin"
          type="time"
          {...register('horaFin')}
          destructive={Boolean(errors.horaFin)}
          hint={errors.horaFin?.message}
        />
      </div>
      <p className="-mt-2 text-body-sm text-text-secondary">
        {minutos === null
          ? 'Deja la hora de fin vacía si la parada sigue abierta.'
          : `Duración calculada automáticamente: ${minutos} min`}
      </p>

      <Controller
        control={control}
        name="tipoCausaId"
        render={({ field }) => (
          <Select
            label="Tipo de parada"
            placeholder="Selecciona el tipo"
            options={tipos}
            value={field.value}
            onValueChange={field.onChange}
            destructive={Boolean(errors.tipoCausaId)}
            hint={errors.tipoCausaId?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="causaId"
        render={({ field }) => (
          <Select
            label="Causa codificada"
            placeholder={tipoCausaId ? 'Selecciona la causa específica' : 'Elige primero el tipo'}
            options={especificas}
            value={field.value}
            onValueChange={field.onChange}
            disabled={!tipoCausaId}
            destructive={Boolean(errors.causaId)}
            hint={errors.causaId?.message}
          />
        )}
      />

      <Textarea
        label="Acción tomada"
        rows={3}
        placeholder="Ej.: Se reemplazó cadena y se reajustó tensión"
        {...register('accionTomada')}
        destructive={Boolean(errors.accionTomada)}
        hint={errors.accionTomada?.message ?? 'Obligatoria para la trazabilidad (RF3).'}
      />

      <Input
        label="N° de solicitud (opcional)"
        placeholder="SM-2026-0421"
        {...register('numeroSolicitud')}
        destructive={Boolean(errors.numeroSolicitud)}
        hint={errors.numeroSolicitud?.message}
      />

      <Controller
        control={control}
        name="responsableId"
        render={({ field }) => (
          <Select
            label="Responsable"
            placeholder="Selecciona un responsable"
            options={opcionesResponsable}
            value={field.value}
            onValueChange={field.onChange}
            destructive={Boolean(errors.responsableId)}
            hint={errors.responsableId?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="afectaOee"
        render={({ field }) => (
          <Switch
            checked={field.value ?? false}
            onCheckedChange={field.onChange}
            label="Afecta el cálculo de OEE"
            supporting="Las paradas planificadas no descuentan disponibilidad."
          />
        )}
      />
    </form>
  );
}
