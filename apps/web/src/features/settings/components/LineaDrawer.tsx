'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Drawer, DrawerContent, Input, Overline, Select, toast } from '@mes/ui';
import { ESTADOS_CATALOGO, TIPOS_PROCESO_LINEA, TIPO_PROCESO_LABEL, lineaSchema } from '@mes/types';
import type { EstadoCatalogo, Linea, LineaInput } from '@mes/types';
import { useActualizarLinea, useCrearLinea } from '@/features/catalogs/hooks';

const ESTADO_LABEL: Record<EstadoCatalogo, string> = {
  activo: 'Activa',
  inactivo: 'Inactiva',
};

const DEFAULT_VALUES: LineaInput = {
  codigo: '',
  nombre: '',
  nombreCorto: '',
  tipoProceso: 'llenadora',
  estado: 'activo',
  capacidadUnidadesMin: 0,
};

function valoresDesde(linea: Linea): LineaInput {
  return {
    codigo: linea.codigo,
    nombre: linea.nombre,
    nombreCorto: linea.nombreCorto,
    tipoProceso: linea.tipoProceso,
    estado: linea.estado,
    capacidadUnidadesMin: linea.capacidadUnidadesMin,
  };
}

export interface LineaDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Línea a editar; si se omite, el drawer abre en modo alta. */
  linea?: Linea;
}

/**
 * `Configuración / Líneas` — drawer de alta y edición. La línea **es** la
 * máquina física de planta: no hay un nivel de equipo por debajo, así que este
 * mantenedor es el único punto donde se dan de alta las máquinas del sistema.
 *
 * `linea` puede cambiar sin desmontar el drawer (mismo componente reutilizado
 * para editar filas distintas): se resincroniza al abrir.
 */
export function LineaDrawer({ open, onOpenChange, linea }: LineaDrawerProps) {
  const crear = useCrearLinea();
  const actualizar = useActualizarLinea();
  const enEdicion = Boolean(linea);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LineaInput>({
    resolver: zodResolver(lineaSchema),
    defaultValues: DEFAULT_VALUES,
  });

  React.useEffect(() => {
    reset(open && linea ? valoresDesde(linea) : DEFAULT_VALUES);
  }, [open, linea, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      if (linea) {
        const actualizada = await actualizar.mutateAsync({ id: linea.id, input: valores });
        toast.success(`Línea ${actualizada.codigo} actualizada`);
      } else {
        const creada = await crear.mutateAsync(valores);
        toast.success(`Línea ${creada.codigo} creada`, {
          description: 'Ya está disponible al registrar órdenes, paradas y mermas.',
        });
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(enEdicion ? 'No se pudo actualizar la línea' : 'No se pudo crear la línea', {
        description: error instanceof Error ? error.message : 'Revisa el código y el tipo de proceso.',
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={enEdicion ? 'Editar línea' : 'Nueva línea'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-linea" loading={isSubmitting}>
              {enEdicion ? 'Guardar cambios' : 'Crear línea'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Overline>Datos de la línea</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            La línea es la máquina física de planta. Su código se usa al registrar órdenes de
            fabricación, paradas, mermas y velocidades estándar.
          </p>

          <form id="form-linea" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Código de línea"
              placeholder="LLEN-M2"
              autoFocus={!enEdicion}
              {...register('codigo')}
              destructive={Boolean(errors.codigo)}
              hint={errors.codigo?.message ?? 'Formato LLEN-M2, EXTR-2 o MOLD-A3.'}
            />
            <Input
              label="Nombre de la línea"
              placeholder="Ej.: Llenadora M2"
              {...register('nombre')}
              destructive={Boolean(errors.nombre)}
              hint={errors.nombre?.message}
            />
            <Input
              label="Nombre corto"
              placeholder="LLEN M2"
              {...register('nombreCorto')}
              destructive={Boolean(errors.nombreCorto)}
              hint={errors.nombreCorto?.message ?? 'Etiqueta compacta del panel y del modo TV.'}
            />
            <Controller
              control={control}
              name="tipoProceso"
              render={({ field }) => (
                <Select
                  label="Tipo de proceso"
                  placeholder="Selecciona el tipo de proceso"
                  options={TIPOS_PROCESO_LINEA.map((t) => ({
                    value: t,
                    label: TIPO_PROCESO_LABEL[t],
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  destructive={Boolean(errors.tipoProceso)}
                  hint={errors.tipoProceso?.message}
                />
              )}
            />
            <Input
              label="Capacidad (unidades por minuto)"
              type="number"
              step="0.1"
              min={0}
              {...register('capacidadUnidadesMin')}
              destructive={Boolean(errors.capacidadUnidadesMin)}
              hint={
                errors.capacidadUnidadesMin?.message ??
                'Velocidad nominal de la línea; el OEE usa la del par producto × línea.'
              }
            />
            <Controller
              control={control}
              name="estado"
              render={({ field }) => (
                <Select
                  label="Estado"
                  options={ESTADOS_CATALOGO.map((e) => ({ value: e, label: ESTADO_LABEL[e] }))}
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
