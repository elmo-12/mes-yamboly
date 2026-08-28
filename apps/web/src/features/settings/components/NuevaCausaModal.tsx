'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Modal, ModalContent, Select, toast } from '@mes/ui';
import { causaParadaSchema } from '@mes/types';
import type { CausaParadaInput } from '@mes/types';
import { useGuardarCausaParada } from '@/features/catalogs/hooks';
import type { CausaPlana } from '@/features/catalogs/causas';

const nuevaCausaSchema = causaParadaSchema.pick({
  codigo: true,
  nombre: true,
  nivel: true,
  parentId: true,
});
type NuevaCausaValues = z.infer<typeof nuevaCausaSchema>;

export interface NuevaCausaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nodos que pueden ser padre (tipos y categorías generales). */
  posiblesPadres: readonly CausaPlana[];
}

/** Alta de causa desde el panel izquierdo de Configuración (spec 10.A). */
export function NuevaCausaModal({ open, onOpenChange, posiblesPadres }: NuevaCausaModalProps) {
  const guardar = useGuardarCausaParada();

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuevaCausaValues>({
    resolver: zodResolver(nuevaCausaSchema),
    defaultValues: { codigo: '', nombre: '', nivel: 'especifica', parentId: null },
  });

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const nivel = watch('nivel');

  const padres = posiblesPadres
    .filter((c) => (nivel === 'general' ? c.nivel === 'tipo' : c.nivel === 'general'))
    .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));

  const onSubmit = handleSubmit(async (valores) => {
    const input: CausaParadaInput = {
      ...valores,
      clasificacion: 'imprevista',
      afectaOee: true,
      requiereEvidencia: false,
      requiereSolicitud: false,
      tiempoEstandarMin: 0,
      lineasAplicables: [],
      estado: 'activo',
    };
    try {
      await guardar.mutateAsync({ input });
      toast.success(`Causa ${valores.codigo} creada`, {
        description: 'Complétala en el panel de detalle antes de usarla en producción.',
      });
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo crear la causa', {
        description: error instanceof Error ? error.message : 'Revisa el código y el nombre.',
      });
    }
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Nueva causa de parada"
        description="La codificación TT-GG-EE mantiene el catálogo uniforme entre líneas (RF11)."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-nueva-causa" loading={isSubmitting}>
              Crear causa
            </Button>
          </>
        }
      >
        <form id="form-nueva-causa" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Controller
            control={control}
            name="nivel"
            render={({ field }) => (
              <Select
                label="Nivel del catálogo"
                options={[
                  { value: 'tipo', label: 'Tipo (nivel 1) · PM-01' },
                  { value: 'general', label: 'Categoría general (nivel 2) · PM-01-A' },
                  { value: 'especifica', label: 'Causa específica (nivel 3) · PM-01-03' },
                ]}
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
          {nivel !== 'tipo' && (
            <Controller
              control={control}
              name="parentId"
              render={({ field }) => (
                <Select
                  label="Nodo padre"
                  placeholder="Selecciona el nodo padre"
                  options={padres}
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  destructive={Boolean(errors.parentId)}
                  hint={errors.parentId?.message}
                />
              )}
            />
          )}
          <Input
            label="Código"
            placeholder="PM-01-05"
            {...register('codigo')}
            destructive={Boolean(errors.codigo)}
            hint={errors.codigo?.message ?? 'Formatos válidos: PM-01, PM-01-A o PM-01-03.'}
          />
          <Input
            label="Nombre de la causa"
            placeholder="Obstrucción de boquilla"
            {...register('nombre')}
            destructive={Boolean(errors.nombre)}
            hint={errors.nombre?.message}
          />
        </form>
      </ModalContent>
    </Modal>
  );
}
