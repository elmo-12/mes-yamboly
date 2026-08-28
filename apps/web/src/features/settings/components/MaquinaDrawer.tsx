'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Drawer, DrawerContent, Input, Overline, Select, toast } from '@mes/ui';
import { ESTADOS_MAQUINA, maquinaSchema } from '@mes/types';
import type { MaquinaInput } from '@mes/types';
import { useCrearMaquina, useLineas } from '@/features/catalogs/hooks';

const ESTADO_LABEL: Record<(typeof ESTADOS_MAQUINA)[number], string> = {
  operativa: 'Operativa',
  mantenimiento: 'En mantenimiento',
  baja: 'De baja',
};

export interface MaquinaDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** `Configuración / Máquinas` — drawer "Nueva máquina" (Figma 2165:11984). */
export function MaquinaDrawer({ open, onOpenChange }: MaquinaDrawerProps) {
  const { data: lineas } = useLineas();
  const crear = useCrearMaquina();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MaquinaInput>({
    resolver: zodResolver(maquinaSchema),
    defaultValues: { codigo: '', nombre: '', tipo: '', lineaId: '', estado: 'operativa' },
  });

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      const maquina = await crear.mutateAsync(valores);
      toast.success(`Máquina ${maquina.codigo} creada`, {
        description: 'Ya está disponible al registrar paradas de esa línea.',
      });
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo crear la máquina', {
        description: error instanceof Error ? error.message : 'Revisa el código y la línea.',
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Nueva máquina"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-maquina" loading={isSubmitting}>
              Crear máquina
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Overline>Datos del equipo</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            El código lleva el prefijo de la línea y se usa al registrar paradas, mermas y órdenes
            de fabricación.
          </p>

          <form id="form-maquina" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Código de máquina"
              placeholder="MQ-L3-02"
              {...register('codigo')}
              destructive={Boolean(errors.codigo)}
              hint={errors.codigo?.message ?? 'Formato MQ-<línea>-<correlativo>.'}
            />
            <Input
              label="Nombre de la máquina"
              placeholder="Ej.: Codificadora Domino L3"
              {...register('nombre')}
              destructive={Boolean(errors.nombre)}
              hint={errors.nombre?.message}
            />
            <Input
              label="Tipo de equipo"
              placeholder="Codificadora, Envolvedora, Túnel de frío…"
              {...register('tipo')}
              destructive={Boolean(errors.tipo)}
              hint={errors.tipo?.message}
            />
            <Controller
              control={control}
              name="lineaId"
              render={({ field }) => (
                <Select
                  label="Línea de producción"
                  placeholder="Selecciona una línea"
                  options={(lineas?.data ?? []).map((l) => ({
                    value: l.id,
                    label: `${l.codigo} · ${l.nombre}`,
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  destructive={Boolean(errors.lineaId)}
                  hint={errors.lineaId?.message ?? 'Determina qué maquinistas la ven.'}
                />
              )}
            />
            <Controller
              control={control}
              name="estado"
              render={({ field }) => (
                <Select
                  label="Estado"
                  options={ESTADOS_MAQUINA.map((e) => ({ value: e, label: ESTADO_LABEL[e] }))}
                  value={field.value}
                  onValueChange={field.onChange}
                />
              )}
            />
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
