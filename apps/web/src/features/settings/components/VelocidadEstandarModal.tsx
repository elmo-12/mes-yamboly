'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Modal, ModalContent, Select, Switch, toast } from '@mes/ui';
import { velocidadEstandarSchema } from '@mes/types';
import type { Producto, VelocidadEstandar, VelocidadEstandarInput } from '@mes/types';
import { formatNumber } from '@mes/shared';
import {
  useActualizarVelocidadEstandar,
  useCrearVelocidadEstandar,
  useLineas,
} from '@/features/catalogs/hooks';
import { ApiClientError } from '@/services/api/client';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';

/** Opcional a `null`: campos vacíos de CIP/arranque no tienen valor definido en el maestro. */
function numeroOpcional(valor: unknown): number | null {
  if (valor === '' || valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

const DEFAULT_VALUES: VelocidadEstandarInput = {
  productoId: '',
  lineaId: '',
  velocidadUnidHora: 0,
  mermaEstandarPct: 0,
  cipMin: null,
  arranqueMin: null,
  estado: 'activo',
};

function valoresDesde(velocidad: VelocidadEstandar): VelocidadEstandarInput {
  return {
    productoId: velocidad.productoId,
    lineaId: velocidad.lineaId,
    velocidadUnidHora: velocidad.velocidadUnidHora,
    mermaEstandarPct: velocidad.mermaEstandarPct,
    cipMin: velocidad.cipMin,
    arranqueMin: velocidad.arranqueMin,
    estado: velocidad.estado,
  };
}

export interface VelocidadEstandarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Producto;
  /** Línea precargada (p. ej. desde la fila "nueva velocidad" de esa línea); bloquea el selector. */
  lineaId?: string;
  /** Par a editar; si se omite, el modal abre en modo alta. */
  velocidad?: VelocidadEstandar;
}

/**
 * `Configuración / Productos y velocidades` — alta y edición del par
 * producto × línea (tabla `producto_linea`). La velocidad se captura en
 * unidades por **hora** (dato del maestro); el modal muestra en vivo el
 * equivalente en u/min, que es la magnitud que congela la orden y consume el
 * cálculo del factor Desempeño del OEE.
 */
export function VelocidadEstandarModal({
  open,
  onOpenChange,
  producto,
  lineaId,
  velocidad,
}: VelocidadEstandarModalProps) {
  const { data: lineas } = useLineas();
  const crear = useCrearVelocidadEstandar();
  const actualizar = useActualizarVelocidadEstandar();
  const enEdicion = Boolean(velocidad);
  const lineaBloqueada = enEdicion || Boolean(lineaId);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VelocidadEstandarInput>({
    resolver: zodResolver(velocidadEstandarSchema),
    defaultValues: DEFAULT_VALUES,
  });

  React.useEffect(() => {
    if (open) {
      reset(
        velocidad
          ? valoresDesde(velocidad)
          : { ...DEFAULT_VALUES, productoId: producto.id, lineaId: lineaId ?? '' },
      );
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [open, velocidad, producto.id, lineaId, reset]);

  const velocidadUnidHoraTexto = watch('velocidadUnidHora');
  const equivalenteUnidMin = (Number(velocidadUnidHoraTexto) || 0) / 60;

  const onSubmit = handleSubmit(async (valores) => {
    const input = { ...valores, productoId: producto.id };
    try {
      if (velocidad) {
        await actualizar.mutateAsync({ id: velocidad.id, input });
        toast.success('Velocidad estándar actualizada', {
          description: `${producto.codigo} · ${formatNumber(input.velocidadUnidHora)} u/h ≈ ${formatNumber(
            input.velocidadUnidHora / 60,
            1,
          )} u/min`,
        });
      } else {
        await crear.mutateAsync(input);
        toast.success('Velocidad estándar creada', {
          description: `${producto.codigo} · ${formatNumber(input.velocidadUnidHora)} u/h ≈ ${formatNumber(
            input.velocidadUnidHora / 60,
            1,
          )} u/min`,
        });
      }
      onOpenChange(false);
    } catch (error) {
      /* 409: par producto × línea ya existe — el detalle del contrato solo trae
         los ids, así que el mensaje legible es `error.message`. */
      if (error instanceof ApiClientError && error.statusCode === 409) {
        setError('lineaId', { type: 'server', message: error.message });
        toast.error('Ese par producto × línea ya existe', { description: error.message });
        return;
      }
      const campos = aplicarErroresApi<VelocidadEstandarInput>(error, setError);
      if (campos.length > 0) {
        toast.error('Revisa los campos marcados', { description: 'La velocidad no se guardó.' });
        return;
      }
      toast.error(enEdicion ? 'No se pudo actualizar la velocidad' : 'No se pudo crear la velocidad', {
        description: mensajeDeError(error, 'Revisa los datos del formulario.'),
      });
    }
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={enEdicion ? 'Editar velocidad estándar' : 'Nueva velocidad estándar'}
        description={`${producto.codigo} · ${producto.nombre}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="form-velocidad-estandar"
              loading={isSubmitting}
            >
              {enEdicion ? 'Guardar cambios' : 'Crear velocidad'}
            </Button>
          </>
        }
      >
        <form id="form-velocidad-estandar" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Controller
            control={control}
            name="lineaId"
            render={({ field }) => (
              <Select
                label="Línea"
                placeholder="Selecciona una línea"
                disabled={lineaBloqueada}
                options={(lineas?.data ?? []).map((l) => ({
                  value: l.id,
                  label: `${l.codigo} · ${l.nombre}`,
                }))}
                value={field.value}
                onValueChange={field.onChange}
                destructive={Boolean(errors.lineaId)}
                hint={errors.lineaId?.message}
              />
            )}
          />
          <Input
            label="Velocidad estándar"
            type="number"
            inputMode="numeric"
            min={1}
            suffix="u/h"
            autoFocus
            {...register('velocidadUnidHora', { valueAsNumber: true })}
            destructive={Boolean(errors.velocidadUnidHora)}
            hint={
              errors.velocidadUnidHora?.message ??
              `Equivale a ${formatNumber(equivalenteUnidMin, 1)} u/min · es la magnitud que consume el OEE.`
            }
          />
          <Input
            label="Merma estándar"
            type="number"
            step="0.1"
            min={0}
            max={100}
            suffix="%"
            {...register('mermaEstandarPct', { valueAsNumber: true })}
            destructive={Boolean(errors.mermaEstandarPct)}
            hint={errors.mermaEstandarPct?.message}
          />
          <Input
            label="CIP"
            type="number"
            min={0}
            suffix="min"
            placeholder="Opcional"
            {...register('cipMin', { setValueAs: numeroOpcional })}
            destructive={Boolean(errors.cipMin)}
            hint={errors.cipMin?.message}
          />
          <Input
            label="Arranque"
            type="number"
            min={0}
            suffix="min"
            placeholder="Opcional"
            {...register('arranqueMin', { setValueAs: numeroOpcional })}
            destructive={Boolean(errors.arranqueMin)}
            hint={errors.arranqueMin?.message}
          />
          <Controller
            control={control}
            name="estado"
            render={({ field }) => (
              <Switch
                label="Par activo"
                supporting="Los pares inactivos dejan de ofrecerse al iniciar una orden en esa línea."
                checked={field.value === 'activo'}
                onCheckedChange={(checked) => field.onChange(checked ? 'activo' : 'inactivo')}
              />
            )}
          />
        </form>
      </ModalContent>
    </Modal>
  );
}
