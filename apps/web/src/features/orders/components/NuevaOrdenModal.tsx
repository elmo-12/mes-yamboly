'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Modal, ModalContent, Select, toast } from '@mes/ui';
import { TURNOS, TURNO_LABEL, createOrdenSchema } from '@mes/types';
import type { CreateOrdenInput } from '@mes/types';
import { addDays, formatNumber, formatSpeed, toIsoDate, turnoPorHora } from '@mes/shared';
import {
  useLineas,
  useProductos,
  useUsuarios,
  useVelocidadesEstandar,
} from '@/features/catalogs/hooks';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { useCrearOrden } from '../hooks';

/** Campos visibles del modal (spec 04.I reducida a un paso, brief V3 §1). */
const nuevaOrdenSchema = createOrdenSchema.pick({
  lineaId: true,
  productoId: true,
  codigo: true,
  lote: true,
  turno: true,
  planificado: true,
});
type NuevaOrdenInput = z.infer<typeof nuevaOrdenSchema>;

/** Vida útil comercial del helado en planta: 6 meses. */
const DIAS_VENCIMIENTO = 184;

export interface NuevaOrdenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuevaOrdenModal({ open, onOpenChange }: NuevaOrdenModalProps) {
  const { data: lineas } = useLineas();
  const { data: usuarios } = useUsuarios();
  const crear = useCrearOrden();

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<NuevaOrdenInput>({
    resolver: zodResolver(nuevaOrdenSchema),
    /* `planificado` se deja sin valor para que el campo salga vacío. */
    defaultValues: {
      lineaId: '',
      productoId: '',
      codigo: '',
      lote: '',
      /* Turno sugerido por la hora de planta: D 06:00–18:00 · N 18:00–06:00. */
      turno: turnoPorHora(new Date().getHours()),
    },
  });

  const lineaId = watch('lineaId');
  const productoId = watch('productoId');
  /* Sólo productos con par producto × línea activo en la línea elegida. */
  const { data: productos } = useProductos({ lineaId: lineaId || undefined });
  /* La velocidad estándar vive en el par, nunca en el producto. */
  const { data: pares } = useVelocidadesEstandar(
    { productoId, lineaId, estado: 'activo' },
    { enabled: Boolean(productoId && lineaId) },
  );
  const par = pares?.data.find((v) => v.productoId === productoId && v.lineaId === lineaId);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const opcionesLinea = (lineas?.data ?? []).map((l) => ({
    value: l.id,
    label: `${l.codigo} · ${l.nombre}`,
  }));
  const opcionesProducto = (productos?.data ?? []).map((p) => ({ value: p.id, label: p.nombre }));
  const opcionesTurno = TURNOS.map((t) => ({ value: t, label: TURNO_LABEL[t] }));

  const onSubmit = handleSubmit(async (valores) => {
    const personas = usuarios?.data ?? [];
    const maquinista =
      personas.find((u) => u.rol === 'maquinista' && u.lineaId === valores.lineaId) ??
      personas.find((u) => u.rol === 'maquinista');
    const supervisor = personas.find((u) => u.rol === 'supervisor');

    const payload: CreateOrdenInput = {
      ...valores,
      vencimiento: toIsoDate(addDays(new Date(), DIAS_VENCIMIENTO)),
      maquinistaId: maquinista?.id ?? '',
      supervisorId: supervisor?.id ?? '',
      operarios: 5,
      colaboradorIds: [],
    };

    try {
      const orden = await crear.mutateAsync(payload);
      toast.success(`Orden ${orden.codigo} creada`, {
        description: `${orden.lineaCodigo} · ${orden.productoNombre} · turno ${TURNO_LABEL[orden.turno]}`,
      });
      onOpenChange(false);
    } catch (error) {
      /* 422: p. ej. `productoId` sin velocidad estándar en la línea elegida. */
      const campos = aplicarErroresApi<NuevaOrdenInput>(error, setError);
      toast.error('No se pudo crear la orden', {
        description:
          campos.length > 0
            ? 'Revisa los campos marcados.'
            : mensajeDeError(error, 'Revisa los datos e inténtalo de nuevo.'),
      });
    }
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Nueva orden de fabricación"
        description="Se abrirá en estado En curso sobre la línea seleccionada."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" form="form-nueva-orden" type="submit" loading={isSubmitting}>
              Crear orden
            </Button>
          </>
        }
      >
        <form id="form-nueva-orden" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Controller
            control={control}
            name="lineaId"
            render={({ field }) => (
              <Select
                label="Línea"
                placeholder="Selecciona una línea"
                options={opcionesLinea}
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  clearErrors('productoId');
                }}
                destructive={Boolean(errors.lineaId)}
                hint={errors.lineaId?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="productoId"
            render={({ field }) => (
              <Select
                label="Producto"
                placeholder={lineaId ? 'Selecciona un producto' : 'Elige primero la línea'}
                options={opcionesProducto}
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  clearErrors('productoId');
                }}
                disabled={!lineaId}
                destructive={Boolean(errors.productoId)}
                hint={
                  errors.productoId?.message ??
                  (par
                    ? `Velocidad estándar ${formatSpeed(par.velocidadUnidMin, 1)} · ${formatNumber(par.velocidadUnidHora)} u/h`
                    : undefined)
                }
              />
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="N° de OF"
              placeholder="OF-2026-0816"
              {...register('codigo')}
              destructive={Boolean(errors.codigo)}
              hint={errors.codigo?.message}
            />
            <Input
              label="Lote"
              placeholder="L-260828-02"
              {...register('lote')}
              destructive={Boolean(errors.lote)}
              hint={errors.lote?.message}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="turno"
              render={({ field }) => (
                <Select
                  label="Turno"
                  options={opcionesTurno}
                  value={field.value}
                  onValueChange={field.onChange}
                  destructive={Boolean(errors.turno)}
                  hint={errors.turno?.message}
                />
              )}
            />
            <Input
              label="Planificado"
              type="number"
              inputMode="numeric"
              min={1}
              suffix="u"
              placeholder="10000"
              {...register('planificado')}
              destructive={Boolean(errors.planificado)}
              hint={errors.planificado?.message}
            />
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
