'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Divider,
  Drawer,
  DrawerClose,
  DrawerContent,
  Input,
  Overline,
  Skeleton,
  Switch,
  toast,
} from '@mes/ui';
import { umbralesSchema, type UmbralesInput } from '@mes/types';
import { ApiClientError } from '@/services/api/client';
import { useGuardarUmbrales, useUmbrales } from '../hooks';

export interface UmbralesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VACIO: UmbralesInput = {
  velocidadBajoEstandarPct: 5,
  oeeMinimo: 75,
  probabilidadMinima: 70,
  notificarN8n: true,
  mostrarTv: true,
};

/**
 * `Alertas / Configurar umbrales (drawer)` — Figma 2163:15102.
 * Drawer 480: reglas del modelo, tres condiciones de disparo con hint, dos
 * notificaciones (n8n/WhatsApp y Modo TV) y nota del efecto sobre la EP.
 */
export function UmbralesDrawer({ open, onOpenChange }: UmbralesDrawerProps) {
  const { data, isPending, isError } = useUmbrales();
  const guardar = useGuardarUmbrales();

  const form = useForm<UmbralesInput>({
    resolver: zodResolver(umbralesSchema),
    defaultValues: VACIO,
  });
  const { register, handleSubmit, reset, control, watch, formState } = form;

  React.useEffect(() => {
    if (!data) return;
    reset({
      velocidadBajoEstandarPct: data.velocidadBajoEstandarPct,
      oeeMinimo: data.oeeMinimo,
      probabilidadMinima: data.probabilidadMinima,
      notificarN8n: data.notificarN8n,
      mostrarTv: data.mostrarTv,
    });
  }, [data, reset]);

  const probabilidad = Number(watch('probabilidadMinima')) || 0;

  const onSubmit = handleSubmit(async (valores) => {
    try {
      await guardar.mutateAsync(valores);
      toast.success('Umbrales guardados', {
        description: 'Aplican al próximo ciclo de evaluación del modelo (cada 5 min).',
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiClientError && error.statusCode === 403) {
        toast.error('Sin permiso para cambiar los umbrales', {
          description: 'Solo el jefe de producción puede editar las reglas del modelo.',
        });
        return;
      }
      toast.error('No se pudieron guardar los umbrales', {
        description: error instanceof Error ? error.message : 'Reintenta en unos segundos.',
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Configurar umbrales de alerta"
        footer={
          <>
            <DrawerClose asChild>
              <Button variant="secondary" type="button">
                Cancelar
              </Button>
            </DrawerClose>
            <Button
              variant="primary"
              type="submit"
              form="form-umbrales"
              loading={guardar.isPending}
              disabled={isPending || isError}
            >
              Guardar umbrales
            </Button>
          </>
        }
      >
        {isPending ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-ctrl-md w-full" />
            <Skeleton className="h-ctrl-md w-full" />
            <Skeleton className="h-ctrl-md w-full" />
          </div>
        ) : isError ? (
          <p className="text-body text-error-text">
            No se pudieron cargar los umbrales vigentes. Cierra el panel y reintenta.
          </p>
        ) : (
          <form id="form-umbrales" onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <section className="flex flex-col gap-2">
              <Overline className="text-text-disabled">Reglas del modelo y de umbral</Overline>
              <p className="text-body text-text-secondary">
                Define cuándo el sistema genera una alerta. Los cambios aplican al próximo ciclo de
                evaluación (cada 5 min) y quedan registrados con tu usuario.
              </p>
            </section>

            <section className="flex flex-col gap-4">
              <Overline className="text-text-disabled">Condiciones de disparo</Overline>
              <Input
                label="Velocidad bajo estándar (%)"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                destructive={Boolean(formState.errors.velocidadBajoEstandarPct)}
                hint={
                  formState.errors.velocidadBajoEstandarPct?.message ??
                  'Alerta si la velocidad cae más de este % respecto al estándar de la línea'
                }
                {...register('velocidadBajoEstandarPct')}
              />
              <Input
                label="OEE mínimo por turno (%)"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                destructive={Boolean(formState.errors.oeeMinimo)}
                hint={
                  formState.errors.oeeMinimo?.message ??
                  'Alerta si el OEE proyectado del turno queda por debajo'
                }
                {...register('oeeMinimo')}
              />
              <Input
                label="Probabilidad mínima para alertar (%)"
                type="number"
                inputMode="numeric"
                min={50}
                max={99}
                destructive={Boolean(formState.errors.probabilidadMinima)}
                hint={
                  formState.errors.probabilidadMinima?.message ??
                  'Con 70 % la EP histórica es 83,5 %; subirlo reduce falsos positivos'
                }
                {...register('probabilidadMinima')}
              />
            </section>

            <Divider />

            <section className="flex flex-col gap-4">
              <Overline className="text-text-disabled">Notificaciones</Overline>
              <Controller
                control={control}
                name="notificarN8n"
                render={({ field }) => (
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    label="Notificar por n8n / WhatsApp"
                    supporting="Envía la alerta al grupo Supervisores de línea"
                  />
                )}
              />
              <Controller
                control={control}
                name="mostrarTv"
                render={({ field }) => (
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    label="Mostrar en Modo TV"
                    supporting="Panel de planta en el mural del área de producción"
                  />
                )}
              />
            </section>

            {probabilidad > 0 && probabilidad < 70 && (
              <p className="rounded-md bg-warning-subtle px-3.5 py-3 text-body-sm text-warning-text">
                Bajar la probabilidad mínima a {probabilidad} % generaría más alertas por turno y
                reduciría la exactitud estimada del modelo (EP).
              </p>
            )}

            {data && (
              <p className="text-body-sm text-text-disabled">
                Última edición: {data.actualizadoPor} · {data.actualizadoEn.replace('T', ' ').slice(0, 16)}
              </p>
            )}
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
