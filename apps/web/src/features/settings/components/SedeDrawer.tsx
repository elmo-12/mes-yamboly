'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Drawer, DrawerContent, Input, Overline, Switch, toast } from '@mes/ui';
import { sedeSchema } from '@mes/types';
import type { Sede, SedeInput } from '@mes/types';
import { useActualizarSede, useCrearSede } from '@/features/catalogs/hooks';
import { ApiClientError } from '@/services/api/client';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';

const DEFAULT_VALUES: SedeInput = { codigo: '', nombre: '', ciudad: '', activa: true };

function valoresDesde(sede: Sede): SedeInput {
  return { codigo: sede.codigo, nombre: sede.nombre, ciudad: sede.ciudad, activa: sede.activa };
}

export interface SedeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sede a editar; si se omite, el drawer abre en modo alta. */
  sede?: Sede;
}

/**
 * `Configuración / Sedes y usuarios` — drawer de alta y edición de sedes
 * (mismo patrón que `MaquinaDrawer`). El código se normaliza a mayúsculas
 * mientras se escribe (formato `AREQ`, 3 o 4 letras).
 */
export function SedeDrawer({ open, onOpenChange, sede }: SedeDrawerProps) {
  const crear = useCrearSede();
  const actualizar = useActualizarSede();
  const enEdicion = Boolean(sede);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SedeInput>({
    resolver: zodResolver(sedeSchema),
    defaultValues: DEFAULT_VALUES,
  });

  React.useEffect(() => {
    reset(open && sede ? valoresDesde(sede) : DEFAULT_VALUES);
  }, [open, sede, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      if (sede) {
        const actualizada = await actualizar.mutateAsync({ id: sede.id, input: valores });
        toast.success(`Sede ${actualizada.codigo} actualizada`);
      } else {
        const creada = await crear.mutateAsync(valores);
        toast.success(`Sede ${creada.codigo} creada`, {
          description: 'Ya puedes asignarle usuarios desde el directorio.',
        });
      }
      onOpenChange(false);
    } catch (error) {
      /* 409: código o nombre de sede duplicado — el mock/API valida ambos. */
      if (error instanceof ApiClientError && error.statusCode === 409 && error.details) {
        const campo =
          'codigo' in error.details ? 'codigo' : 'nombre' in error.details ? 'nombre' : undefined;
        if (campo) {
          setError(campo, { type: 'server', message: error.message });
          toast.error('No se pudo guardar la sede', { description: error.message });
          return;
        }
      }
      const campos = aplicarErroresApi<SedeInput>(error, setError);
      if (campos.length > 0) {
        toast.error('Revisa los campos marcados', { description: 'La sede no se guardó.' });
        return;
      }
      toast.error(enEdicion ? 'No se pudo actualizar la sede' : 'No se pudo crear la sede', {
        description: mensajeDeError(error, 'Revisa los datos del formulario.'),
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={enEdicion ? 'Editar sede' : 'Nueva sede'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-sede" loading={isSubmitting}>
              {enEdicion ? 'Guardar cambios' : 'Crear sede'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Overline>Datos de la planta</Overline>
          <form id="form-sede" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Controller
              control={control}
              name="codigo"
              render={({ field }) => (
                <Input
                  label="Código de sede"
                  placeholder="AREQ"
                  maxLength={4}
                  autoFocus={!enEdicion}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  destructive={Boolean(errors.codigo)}
                  hint={errors.codigo?.message ?? 'Formato AREQ: 3 o 4 letras mayúsculas.'}
                />
              )}
            />
            <Input
              label="Nombre"
              placeholder="Arequipa"
              {...register('nombre')}
              destructive={Boolean(errors.nombre)}
              hint={errors.nombre?.message}
            />
            <Input
              label="Ciudad"
              placeholder="Arequipa"
              {...register('ciudad')}
              destructive={Boolean(errors.ciudad)}
              hint={errors.ciudad?.message}
            />
            <Controller
              control={control}
              name="activa"
              render={({ field }) => (
                <Switch
                  label="Sede activa"
                  supporting="Las sedes inactivas dejan de ofrecerse al crear usuarios."
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
