'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType, ZodTypeDef } from 'zod';
import { Button, Input, Modal, ModalContent, Select, toast } from '@mes/ui';

/** Los 4 campos comunes al alta de cualquier causa (parada o merma). */
export interface NuevaCausaValores {
  codigo: string;
  nombre: string;
  /** `tipo` | `general` | `especifica` · `tipo` | `clasificacion` | `causa`. */
  nivel: string;
  parentId: string | null;
}

/** Nodo que puede actuar de padre en el selector. */
export interface PosiblePadre {
  id: string;
  codigo: string;
  nombre: string;
  nivel: string;
}

export interface NivelOption {
  value: string;
  label: string;
  /** Nivel que deben tener los padres válidos; `null` en la raíz. */
  nivelPadre: string | null;
}

export interface NuevaCausaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Valida los 4 campos comunes; cada catálogo aporta su regex de código. */
  schema: ZodType<NuevaCausaValores, ZodTypeDef, unknown>;
  /** Niveles del catálogo, del más alto al más bajo. */
  niveles: readonly NivelOption[];
  /** Nodos que pueden ser padre (todos los que no son hoja). */
  posiblesPadres: readonly PosiblePadre[];
  /** Alta en el catálogo; la vista decide los valores por defecto del resto de campos. */
  onGuardar: (valores: NuevaCausaValores) => Promise<void>;
  titulo: string;
  descripcion?: string;
  /** Ayuda bajo el campo Código: formatos válidos del catálogo. */
  hintCodigo: string;
  placeholderCodigo?: string;
  placeholderNombre?: string;
  /** Campos extra del catálogo, bajo los comunes. */
  children?: React.ReactNode;
}

/**
 * Alta de causa desde el panel izquierdo de Configuración (spec 10.A),
 * compartida por los catálogos de parada y de merma.
 */
export function NuevaCausaModal({
  open,
  onOpenChange,
  schema,
  niveles,
  posiblesPadres,
  onGuardar,
  titulo,
  descripcion,
  hintCodigo,
  placeholderCodigo,
  placeholderNombre,
  children,
}: NuevaCausaModalProps) {
  const nivelHoja = niveles[niveles.length - 1]?.value ?? '';

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuevaCausaValores>({
    resolver: zodResolver(schema),
    defaultValues: { codigo: '', nombre: '', nivel: nivelHoja, parentId: null },
  });

  React.useEffect(() => {
    if (!open) reset({ codigo: '', nombre: '', nivel: nivelHoja, parentId: null });
  }, [open, reset, nivelHoja]);

  const nivel = watch('nivel');
  const nivelPadre = niveles.find((n) => n.value === nivel)?.nivelPadre ?? null;

  const padres = posiblesPadres
    .filter((c) => c.nivel === nivelPadre)
    .map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nombre}` }));

  const onSubmit = handleSubmit(async (valores) => {
    try {
      await onGuardar(valores);
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
        title={titulo}
        description={descripcion}
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
                options={niveles.map((n) => ({ value: n.value, label: n.label }))}
                value={field.value}
                onValueChange={field.onChange}
              />
            )}
          />
          {nivelPadre !== null && (
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
            placeholder={placeholderCodigo}
            {...register('codigo')}
            destructive={Boolean(errors.codigo)}
            hint={errors.codigo?.message ?? hintCodigo}
          />
          <Input
            label="Nombre de la causa"
            placeholder={placeholderNombre}
            {...register('nombre')}
            destructive={Boolean(errors.nombre)}
            hint={errors.nombre?.message}
          />
          {children}
        </form>
      </ModalContent>
    </Modal>
  );
}
