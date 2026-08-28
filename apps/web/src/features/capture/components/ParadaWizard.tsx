'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCard,
  Badge,
  Button,
  DescriptionList,
  Icon,
  Input,
  Modal,
  ModalContent,
  Select,
  Stepper,
  Switch,
  Tag,
  TimerChip,
  toast,
} from '@mes/ui';
import { createParadaSchema, type CreateParadaInput } from '@mes/types';
import { useCausasParada, useMaquinas } from '@/features/catalogs/hooks';
import { useCrearParada } from '@/features/downtimes/hooks';
import { useSession } from '@/hooks/use-session';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { causasEspecificasDe, etiquetaCausa, tiposDeParada } from '../causas';
import { horaActual, isoDesdeHora, type ContextoLinea } from '../tipos';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import { AdjuntarFoto } from './AdjuntarFoto';
import { ContextoCaptura } from './ContextoCaptura';

const PASOS = [{ label: 'Causa' }, { label: 'Detalle' }, { label: 'Confirmar' }] as const;

const CAMPOS_PASO: Record<number, (keyof CreateParadaInput)[]> = {
  0: ['tipoCausaId', 'inicio'],
  1: ['maquinaId', 'causaId', 'accionTomada', 'numeroSolicitud'],
};

/** Paso al que hay que volver cuando el 422 del servidor señala un campo. */
function pasoDelCampo(campo: string): number {
  for (const [paso, campos] of Object.entries(CAMPOS_PASO)) {
    if ((campos as string[]).includes(campo)) return Number(paso);
  }
  return 1;
}

export interface ParadaWizardProps {
  contexto: ContextoLinea;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * `Parada / P1 Causa · P2 Detalle · P3 Confirmar` (Figma 2156:8269 / 2156:8367
 * / 2163:2538). Modal 640 con chip TRI en el header: el cronómetro arranca al
 * abrir y su valor viaja en `tiempoRegistroSeg` (OE1 · KPI TRI).
 */
export function ParadaWizard({ contexto, abierto, onOpenChange }: ParadaWizardProps) {
  const [paso, setPaso] = React.useState(0);
  const [fotoNombre, setFotoNombre] = React.useState<string>();
  const tri = useTriTimer(abierto);
  const { user } = useSession();
  const { data: arbol } = useCausasParada(contexto.lineaId);
  const { data: maquinas } = useMaquinas(contexto.lineaId);
  const crear = useCrearParada();

  /* El tablero refresca cada 5 s y `contexto` cambia de identidad: se lee por
     referencia para que el formulario NO se reinicie mientras se captura. */
  const contextoRef = React.useRef(contexto);
  contextoRef.current = contexto;
  const usuarioIdRef = React.useRef(user?.id);
  usuarioIdRef.current = user?.id;

  const valoresIniciales = React.useCallback((): CreateParadaInput => {
    const ctx = contextoRef.current;
    return {
      ordenId: ctx.ordenId ?? '',
      lineaId: ctx.lineaId,
      maquinaId: '',
      tipoCausaId: '',
      causaId: '',
      inicio: ctx.deteccionHora ?? horaActual(),
      accionTomada: '',
      numeroSolicitud: '',
      afectaOee: true,
      responsableId: usuarioIdRef.current ?? '',
      origen: ctx.deteccionId ? 'iot' : 'manual',
      deteccionId: ctx.deteccionId,
      tiempoRegistroSeg: 0,
    };
  }, []);

  const form = useForm<CreateParadaInput>({
    resolver: zodResolver(createParadaSchema),
    mode: 'onTouched',
    defaultValues: valoresIniciales(),
  });

  /* Al reabrir el modal el formulario y el paso vuelven al inicio. */
  React.useEffect(() => {
    if (!abierto) return;
    setPaso(0);
    setFotoNombre(undefined);
    form.reset(valoresIniciales());
  }, [abierto, form, valoresIniciales]);

  const tipos = React.useMemo(() => tiposDeParada(arbol?.data ?? []), [arbol]);
  const valores = form.watch();
  const tipoActual = tipos.find((t) => t.id === valores.tipoCausaId);
  const especificas = React.useMemo(() => causasEspecificasDe(tipoActual), [tipoActual]);
  const causaActual = especificas.find((c) => c.id === valores.causaId);
  const maquinaActual = maquinas?.data.find((m) => m.id === valores.maquinaId);

  /* El catálogo marca qué causas exigen N.º de solicitud del CMMS; sin esto el
     campo se enviaba vacío y el backend devolvía 422 en el último paso. */
  const requiereSolicitud = Boolean(causaActual?.requiereSolicitud);

  const siguiente = async () => {
    const ok = await form.trigger(CAMPOS_PASO[paso] ?? []);
    if (!ok) return;
    if (paso === 1 && requiereSolicitud && !valores.numeroSolicitud?.trim()) {
      form.setError('numeroSolicitud', {
        type: 'required',
        message: 'Esta causa requiere un N.º de solicitud de mantenimiento',
      });
      return;
    }
    setPaso((p) => p + 1);
  };

  const guardar = form.handleSubmit(async (values) => {
    const segundos = tri.detener();
    try {
      await crear.mutateAsync({
        ...values,
        inicio: isoDesdeHora(values.inicio),
        numeroSolicitud: values.numeroSolicitud || undefined,
        evidenciaUrl: fotoNombre ? `evidencia/${fotoNombre}` : undefined,
        tiempoRegistroSeg: segundos,
      });
      toast.success(`Parada registrada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      /* 422: el backend detalla el campo (p. ej. `numeroSolicitud` obligatorio
         para PM-01); se pinta bajo el campo y se vuelve a su paso. */
      const campos = aplicarErroresApi<CreateParadaInput>(e, form.setError);
      if (campos.length > 0) {
        setPaso(pasoDelCampo(campos[0] as string));
        toast.error('Revisa los campos marcados', { description: 'La parada no se registró.' });
      } else {
        toast.error(mensajeDeError(e, 'No se pudo registrar la parada'));
      }
    }
  });

  const errores = form.formState.errors;

  const footer =
    paso === 2 ? (
      <>
        <Button variant="secondary" onClick={() => setPaso(1)}>
          Atrás
        </Button>
        <Button
          variant="primary"
          icon={<Icon name="check" size={20} />}
          loading={crear.isPending}
          onClick={() => void guardar()}
        >
          Registrar parada
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="secondary"
          onClick={() => (paso === 0 ? onOpenChange(false) : setPaso(paso - 1))}
        >
          {paso === 0 ? 'Cancelar' : 'Atrás'}
        </Button>
        <Button
          variant="primary"
          icon={<Icon name="arrow-right" size={20} />}
          iconPosition="trailing"
          onClick={() => void siguiente()}
        >
          Siguiente
        </Button>
      </>
    );

  return (
    <Modal open={abierto} onOpenChange={onOpenChange}>
      <ModalContent
        size="lg"
        title="Registrar parada"
        aria-describedby={undefined}
        headerExtra={<TimerChip value={tri.etiqueta} />}
        footer={footer}
      >
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <Stepper steps={PASOS} current={paso} className="mx-auto max-w-[520px]" />

          {paso === 0 && (
            <>
              <ContextoCaptura
                items={[
                  contexto.etiqueta,
                  contexto.ordenCodigo ?? 'Sin orden activa',
                  `Turno ${contexto.turnoLabel}`,
                  user ? `${user.nombre} (${user.cargo})` : '',
                ]}
              />
              <p className="text-h4 text-text-primary">¿Qué tipo de parada?</p>
              <div className="flex flex-wrap gap-2">
                {tipos.map((t) => (
                  <Tag
                    key={t.id}
                    size="lg"
                    selected={valores.tipoCausaId === t.id}
                    onClick={() => {
                      form.setValue('tipoCausaId', t.id, { shouldValidate: true });
                      form.setValue('causaId', '');
                      form.setValue('afectaOee', t.afectaOee);
                    }}
                  >
                    {etiquetaCausa(t)}
                  </Tag>
                ))}
              </div>
              {errores.tipoCausaId && (
                <p className="text-body-sm text-error-text">{errores.tipoCausaId.message}</p>
              )}
              <div className="flex gap-4">
                <Input
                  type="time"
                  className="w-[300px]"
                  wrapperClassName="w-[300px]"
                  label="Hora de inicio"
                  hint={
                    contexto.deteccionHora
                      ? 'Detectada por el sensor · editable'
                      : 'Hora actual del turno · editable'
                  }
                  destructive={Boolean(errores.inicio)}
                  {...form.register('inicio')}
                />
                <div className="flex-1" />
              </div>
            </>
          )}

          {paso === 1 && (
            <>
              <ContextoCaptura
                items={[
                  contexto.etiqueta,
                  contexto.ordenCodigo ?? 'Sin orden activa',
                  tipoActual ? etiquetaCausa(tipoActual) : '',
                  `Inicio ${valores.inicio}`,
                ]}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="maquinaId"
                  render={({ field }) => (
                    <Select
                      label="Máquina"
                      hint="Equipo asociado a la línea"
                      placeholder="Selecciona la máquina"
                      destructive={Boolean(errores.maquinaId)}
                      options={(maquinas?.data ?? []).map((m) => ({ value: m.id, label: m.nombre }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="causaId"
                  render={({ field }) => (
                    <Select
                      label="Causa específica"
                      hint="Catálogo codificado de paradas"
                      placeholder={tipoActual ? 'Selecciona la causa' : 'Elige primero el tipo'}
                      disabled={!tipoActual}
                      destructive={Boolean(errores.causaId)}
                      options={especificas.map((c) => ({ value: c.id, label: etiquetaCausa(c) }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
              <Input
                label="Acción tomada"
                placeholder="Describe qué se hizo para levantar la parada"
                hint={
                  errores.accionTomada?.message ??
                  'Obligatorio · Ej.: Se reemplazó cadena y se reajustó tensión'
                }
                destructive={Boolean(errores.accionTomada)}
                {...form.register('accionTomada')}
              />
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
                <Input
                  label={requiereSolicitud ? 'N.º de solicitud' : 'N.º de solicitud (opcional)'}
                  placeholder="SM-4471"
                  hint={
                    errores.numeroSolicitud?.message ??
                    (requiereSolicitud ? 'Obligatorio para esta causa' : undefined)
                  }
                  destructive={Boolean(errores.numeroSolicitud)}
                  {...form.register('numeroSolicitud')}
                />
                <AdjuntarFoto
                  label="Evidencia (foto)"
                  cta="Adjuntar foto"
                  value={fotoNombre}
                  onChange={setFotoNombre}
                />
              </div>
              <Controller
                control={form.control}
                name="afectaOee"
                render={({ field }) => (
                  <Switch
                    label="Afecta OEE"
                    supporting="Se descuenta del tiempo disponible del turno"
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </>
          )}

          {paso === 2 && (
            <>
              <div className="rounded-md bg-background-subtle px-4 py-1">
                <DescriptionList
                  labelWidth={168}
                  items={[
                    { label: 'Línea', value: contexto.etiqueta },
                    {
                      label: 'Orden de fabricación',
                      value: [contexto.ordenCodigo, contexto.productoNombre]
                        .filter(Boolean)
                        .join(' · ') || '—',
                    },
                    {
                      label: 'Causa',
                      value: [
                        tipoActual ? etiquetaCausa(tipoActual) : '',
                        causaActual ? etiquetaCausa(causaActual) : '',
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    },
                    { label: 'Máquina', value: maquinaActual?.nombre ?? '—' },
                    { label: 'Inicio', value: `${valores.inicio} (turno ${contexto.turnoLabel})` },
                    { label: 'Acción tomada', value: valores.accionTomada },
                    {
                      label: 'Responsable',
                      value: user ? `${user.nombre} · ${user.cargo}` : '—',
                    },
                  ]}
                />
              </div>
              {contexto.deteccionId && (
                <AlertCard
                  variant="info"
                  title="Coincide con la detección del sensor"
                  description={`Esta parada coincide con la detección del sensor IoT a las ${contexto.deteccionHora} — se vinculará automáticamente al evento ${contexto.deteccionId}.`}
                  badge={<Badge color="informational">Informativa</Badge>}
                />
              )}
              <p className="text-body-sm text-text-disabled">
                Se registrará con sello de tiempo{' '}
                {`${valores.inicio}:${String(tri.segundos % 60).padStart(2, '0')}`} y quedará
                disponible en el repositorio de evidencia.
              </p>
            </>
          )}
        </form>
      </ModalContent>
    </Modal>
  );
}
