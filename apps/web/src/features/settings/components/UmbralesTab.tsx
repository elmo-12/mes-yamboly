'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  DescriptionList,
  EmptyState,
  Icon,
  Input,
  SectionTitle,
  Skeleton,
  StickyFooter,
  Switch,
  toast,
} from '@mes/ui';
import { umbralesSchema } from '@mes/types';
import type { UmbralesInput } from '@mes/types';
import { formatDateTime } from '@mes/shared';
import { useGuardarUmbrales, useUmbrales } from '@/features/alerts/hooks';
import { ApiClientError } from '@/services/api/client';

/**
 * Pestaña "Umbrales de alerta" (Figma 2165:13218): formulario Settings por
 * filas con divisores y sticky footer "Cambios sin guardar" al primer cambio.
 * Los campos son los del contrato `PUT /alertas/umbrales`.
 */
export function UmbralesTab() {
  const { data, isPending, error, refetch } = useUmbrales();
  const guardar = useGuardarUmbrales();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<UmbralesInput>({
    resolver: zodResolver(umbralesSchema),
    values: data
      ? {
          velocidadBajoEstandarPct: data.velocidadBajoEstandarPct,
          oeeMinimo: data.oeeMinimo,
          probabilidadMinima: data.probabilidadMinima,
          notificarN8n: data.notificarN8n,
          mostrarTv: data.mostrarTv,
          tciToleranciaMin: data.tciToleranciaMin,
          tciToleranciaPct: data.tciToleranciaPct,
          tciToleranciaDiasSap: data.tciToleranciaDiasSap,
        }
      : undefined,
  });

  const onSubmit = handleSubmit(async (valores) => {
    try {
      const guardados = await guardar.mutateAsync(valores);
      reset({
        velocidadBajoEstandarPct: guardados.velocidadBajoEstandarPct,
        oeeMinimo: guardados.oeeMinimo,
        probabilidadMinima: guardados.probabilidadMinima,
        notificarN8n: guardados.notificarN8n,
        mostrarTv: guardados.mostrarTv,
        tciToleranciaMin: guardados.tciToleranciaMin,
        tciToleranciaPct: guardados.tciToleranciaPct,
        tciToleranciaDiasSap: guardados.tciToleranciaDiasSap,
      });
      toast.success('Umbrales actualizados', {
        description:
          'Las alertas se reevalúan en el próximo ciclo y las tolerancias del TCI, en la siguiente validación.',
      });
    } catch (err) {
      const prohibido = err instanceof ApiClientError && err.statusCode === 403;
      toast.error(prohibido ? 'No tienes permiso para cambiar los umbrales' : 'No se pudieron guardar los umbrales', {
        description: prohibido
          ? 'Solo el Jefe de producción puede modificar los umbrales de alerta.'
          : err instanceof Error
            ? err.message
            : 'Inténtalo de nuevo.',
      });
    }
  });

  if (error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudieron cargar los umbrales"
        description="El servicio de alertas no respondió. Reintenta en unos segundos."
        action={
          <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={() => void refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  if (isPending || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-64" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Umbrales de alerta"
        description={`Definen cuándo el MES genera una alerta operativa · última actualización ${formatDateTime(data.actualizadoEn)} por ${data.actualizadoPor}`}
      />

      <form id="form-umbrales" onSubmit={onSubmit} noValidate>
        <DescriptionList
          labelWidth={320}
          items={[
            {
              label: (
                <Etiqueta
                  titulo="Velocidad por debajo del estándar"
                  apoyo="Alerta cuando la línea baja de este porcentaje"
                />
              ),
              value: (
                <Input
                  aria-label="Velocidad por debajo del estándar"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  suffix="%"
                  className="max-w-[180px]"
                  wrapperClassName="max-w-[180px]"
                  {...register('velocidadBajoEstandarPct')}
                  destructive={Boolean(errors.velocidadBajoEstandarPct)}
                  hint={errors.velocidadBajoEstandarPct?.message}
                />
              ),
            },
            {
              label: (
                <Etiqueta titulo="OEE mínimo por turno" apoyo="Evaluado al cierre de cada turno" />
              ),
              value: (
                <Input
                  aria-label="OEE mínimo por turno"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  suffix="%"
                  className="max-w-[180px]"
                  wrapperClassName="max-w-[180px]"
                  {...register('oeeMinimo')}
                  destructive={Boolean(errors.oeeMinimo)}
                  hint={errors.oeeMinimo?.message}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Probabilidad mínima para alertar"
                  apoyo="Confianza del modelo por debajo de la cual no se notifica"
                />
              ),
              value: (
                <Input
                  aria-label="Probabilidad mínima para alertar"
                  type="number"
                  inputMode="numeric"
                  min={50}
                  max={99}
                  suffix="%"
                  className="max-w-[180px]"
                  wrapperClassName="max-w-[180px]"
                  {...register('probabilidadMinima')}
                  destructive={Boolean(errors.probabilidadMinima)}
                  hint={errors.probabilidadMinima?.message}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Notificar por n8n / WhatsApp"
                  apoyo="Envía la alerta al supervisor de la línea y a jefatura"
                />
              ),
              value: (
                <Controller
                  control={control}
                  name="notificarN8n"
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      label={field.value ? 'Activado' : 'Desactivado'}
                    />
                  )}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Mostrar en Modo TV"
                  apoyo="Las alertas activas aparecen en la pantalla de planta"
                />
              ),
              value: (
                <Controller
                  control={control}
                  name="mostrarTv"
                  render={({ field }) => (
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                      label={field.value ? 'Activado' : 'Desactivado'}
                    />
                  )}
                />
              ),
            },
          ]}
        />

        <SectionTitle
          title="Validación de calidad (TCI)"
          description="Holguras con las que el motor de reglas contrasta cada captura del MES contra las fuentes externas importadas en Evidencia › TCI."
          className="pt-6 pb-2"
        />

        <DescriptionList
          labelWidth={320}
          items={[
            {
              label: (
                <Etiqueta
                  titulo="Tolerancia en tiempos"
                  apoyo="Diferencia admitida entre las horas registradas y las lecturas de sensor"
                />
              ),
              value: (
                <Input
                  aria-label="Tolerancia en tiempos"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  suffix="min"
                  className="max-w-[180px]"
                  wrapperClassName="max-w-[180px]"
                  {...register('tciToleranciaMin')}
                  destructive={Boolean(errors.tciToleranciaMin)}
                  hint={errors.tciToleranciaMin?.message}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Tolerancia en cantidad y velocidad"
                  apoyo="Desviación admitida en kg de merma frente a SAP y en u/min frente al sensor"
                />
              ),
              value: (
                <Input
                  aria-label="Tolerancia en cantidad y velocidad"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  suffix="%"
                  className="max-w-[180px]"
                  wrapperClassName="max-w-[180px]"
                  {...register('tciToleranciaPct')}
                  destructive={Boolean(errors.tciToleranciaPct)}
                  hint={errors.tciToleranciaPct?.message}
                />
              ),
            },
            {
              label: (
                <Etiqueta
                  titulo="Holgura de fecha en SAP"
                  apoyo="Días entre la merma registrada y su transferencia de merma en SAP"
                />
              ),
              value: (
                <Input
                  aria-label="Holgura de fecha en SAP"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={15}
                  suffix="días"
                  className="max-w-[180px]"
                  wrapperClassName="max-w-[180px]"
                  {...register('tciToleranciaDiasSap')}
                  destructive={Boolean(errors.tciToleranciaDiasSap)}
                  hint={errors.tciToleranciaDiasSap?.message}
                />
              ),
            },
          ]}
        />
      </form>

      {isDirty && (
        <StickyFooter
          message="Cambios sin guardar · se aplicarán a todas las líneas"
          actions={
            <>
              <Button variant="secondary" onClick={() => reset()}>
                Descartar
              </Button>
              <Button variant="primary" type="submit" form="form-umbrales" loading={isSubmitting}>
                Guardar cambios
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}

function Etiqueta({ titulo, apoyo }: { titulo: string; apoyo: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-body text-text-primary">{titulo}</span>
      <span className="text-body-sm text-text-secondary">{apoyo}</span>
    </span>
  );
}
