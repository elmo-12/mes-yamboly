'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Drawer, DrawerContent, Input, Overline, Select, toast } from '@mes/ui';
import { ESTADOS_MAQUINA, maquinaSchema } from '@mes/types';
import type { Maquina, MaquinaInput } from '@mes/types';
import { useActualizarMaquina, useCrearMaquina, useLineas } from '@/features/catalogs/hooks';

const ESTADO_LABEL: Record<(typeof ESTADOS_MAQUINA)[number], string> = {
  operativa: 'Operativa',
  mantenimiento: 'En mantenimiento',
  baja: 'De baja',
};

const DEFAULT_VALUES: MaquinaInput = {
  codigo: '',
  nombre: '',
  tipo: '',
  lineaId: '',
  estado: 'operativa',
};

function valoresDesde(maquina: Maquina): MaquinaInput {
  return {
    codigo: maquina.codigo,
    nombre: maquina.nombre,
    tipo: maquina.tipo,
    lineaId: maquina.lineaId,
    estado: maquina.estado,
  };
}

export interface MaquinaDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Máquina a editar; si se omite, el drawer abre en modo alta. */
  maquina?: Maquina;
}

/**
 * `Configuración / Máquinas` — drawer de alta y edición (Figma 2165:11984).
 * `maquina` puede cambiar sin desmontar el drawer (mismo componente
 * reutilizado para editar filas distintas): se resincroniza al abrir.
 */
export function MaquinaDrawer({ open, onOpenChange, maquina }: MaquinaDrawerProps) {
  const { data: lineas } = useLineas();
  const crear = useCrearMaquina();
  const actualizar = useActualizarMaquina();
  const enEdicion = Boolean(maquina);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MaquinaInput>({
    resolver: zodResolver(maquinaSchema),
    defaultValues: DEFAULT_VALUES,
  });

  React.useEffect(() => {
    reset(open && maquina ? valoresDesde(maquina) : DEFAULT_VALUES);
  }, [open, maquina, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      if (maquina) {
        const actualizada = await actualizar.mutateAsync({ id: maquina.id, input: valores });
        toast.success(`Máquina ${actualizada.codigo} actualizada`);
      } else {
        const creada = await crear.mutateAsync(valores);
        toast.success(`Máquina ${creada.codigo} creada`, {
          description: 'Ya está disponible al registrar paradas de esa línea.',
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(enEdicion ? 'No se pudo actualizar la máquina' : 'No se pudo crear la máquina', {
        description: error instanceof Error ? error.message : 'Revisa el código y la línea.',
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={enEdicion ? 'Editar máquina' : 'Nueva máquina'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-maquina" loading={isSubmitting}>
              {enEdicion ? 'Guardar cambios' : 'Crear máquina'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Overline>Datos del equipo</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            El código lleva el código de la línea (sin guiones) y se usa al registrar paradas,
            mermas y órdenes de fabricación.
          </p>

          <form id="form-maquina" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Código de máquina"
              placeholder="MQ-LLENM2-01"
              autoFocus={!enEdicion}
              {...register('codigo')}
              destructive={Boolean(errors.codigo)}
              hint={errors.codigo?.message ?? 'Formato MQ-<línea sin guiones>-<correlativo>: MQ-LLENM2-01.'}
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
