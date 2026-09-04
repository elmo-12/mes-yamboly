'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  DescriptionList,
  FieldShell,
  Icon,
  Input,
  Modal,
  ModalContent,
  Select,
  Stepper,
  Tag,
  TimerChip,
  cn,
  toast,
} from '@mes/ui';
import { TIPOS_MERMA, TIPO_MERMA_LABEL, createMermaSchema, type CreateMermaInput } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useCausasMerma, usePersonas, useProductos } from '@/features/catalogs/hooks';
import { useCrearMerma } from '@/features/scrap/hooks';
import { useSession } from '@/hooks/use-session';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { etiquetaCausa } from '../causas';
import type { ContextoLinea } from '../tipos';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import { ContextoCaptura } from './ContextoCaptura';
import { TecladoNumerico } from './TecladoNumerico';

const PASOS = [{ label: 'Tipo' }, { label: 'Causa' }, { label: 'Confirmar' }] as const;

const CAMPOS_PASO: Record<number, (keyof CreateMermaInput)[]> = {
  0: ['tipo', 'cantidadKg', 'sabor'],
  1: ['causaId', 'responsableId'],
};

export interface MermaWizardProps {
  contexto: ContextoLinea;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * `Merma / P1 Tipo y cantidad · P2 Causa y responsable · P3 Confirmar`
 * (Figma 2163:9376 / 2163:9517 / 2163:11105). Modal 640 con chip TRI.
 */
export function MermaWizard({ contexto, abierto, onOpenChange }: MermaWizardProps) {
  const [paso, setPaso] = React.useState(0);
  const [cantidadTexto, setCantidadTexto] = React.useState('');
  const tri = useTriTimer(abierto);
  const { user } = useSession();
  const { data: causas } = useCausasMerma();
  const { data: productos } = useProductos(contexto.lineaId);
  const { data: personas } = usePersonas();
  const crear = useCrearMerma();

  /* `contexto` cambia de identidad en cada refresco de 5 s: se lee por
     referencia para no reiniciar el formulario a mitad de la captura. */
  const contextoRef = React.useRef(contexto);
  contextoRef.current = contexto;
  const usuarioIdRef = React.useRef(user?.id);
  usuarioIdRef.current = user?.id;

  const defaults = React.useCallback((): CreateMermaInput => {
    const ctx = contextoRef.current;
    return {
      ordenId: ctx.ordenId ?? '',
      lineaId: ctx.lineaId,
      tipo: 'EP',
      cantidadKg: 0,
      sabor: ctx.productoNombre ?? '',
      causaId: '',
      responsableId: usuarioIdRef.current ?? '',
      codigoBalde: '',
      enviarPasteurizacion: false,
      observacion: '',
      tiempoRegistroSeg: 0,
    };
  }, []);

  const form = useForm<CreateMermaInput>({
    resolver: zodResolver(createMermaSchema),
    mode: 'onTouched',
    defaultValues: defaults(),
  });

  React.useEffect(() => {
    if (!abierto) return;
    setPaso(0);
    setCantidadTexto('');
    form.reset(defaults());
  }, [abierto, defaults, form]);

  const valores = form.watch();
  const errores = form.formState.errors;
  const causasAplicables = (causas?.data ?? []).filter((c) => c.aplicaA.includes(valores.tipo));
  const causaActual = causasAplicables.find((c) => c.id === valores.causaId);
  const responsable = personas?.data.find((p) => p.id === valores.responsableId);

  const escribirCantidad = (texto: string) => {
    const limpio = texto.replace(/[^0-9,]/g, '').replace(/(,.*),/g, '$1').slice(0, 7);
    setCantidadTexto(limpio);
    form.setValue('cantidadKg', Number(limpio.replace(',', '.')) || 0, { shouldValidate: true });
  };

  const siguiente = async () => {
    const ok = await form.trigger(CAMPOS_PASO[paso] ?? []);
    if (ok) setPaso((p) => p + 1);
  };

  const guardar = form.handleSubmit(async (values) => {
    const segundos = tri.detener();
    try {
      await crear.mutateAsync({
        ...values,
        codigoBalde: values.codigoBalde || undefined,
        observacion: values.observacion || undefined,
        tiempoRegistroSeg: segundos,
      });
      toast.success(`Merma registrada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      const campos = aplicarErroresApi<CreateMermaInput>(e, form.setError);
      toast.error(
        campos.length > 0 ? 'Revisa los campos marcados' : mensajeDeError(e, 'No se pudo registrar la merma'),
      );
    }
  });

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
          Registrar merma
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
        title="Registrar merma"
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
              <p className="text-h4 text-text-primary">¿Qué tipo de merma?</p>
              <div className="flex flex-wrap gap-2">
                {TIPOS_MERMA.map((t) => (
                  <Tag
                    key={t}
                    size="lg"
                    selected={valores.tipo === t}
                    onClick={() => {
                      form.setValue('tipo', t, { shouldValidate: true });
                      form.setValue('causaId', '');
                    }}
                  >
                    {`${t} · ${TIPO_MERMA_LABEL[t]}`}
                  </Tag>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_212px]">
                <div className="flex flex-col gap-4">
                  <FieldShell
                    label="Cantidad (kg)"
                    hint={errores.cantidadKg?.message ?? `Balanza ${contexto.lineaCodigo} · tolerancia ±0,2 kg`}
                    destructive={Boolean(errores.cantidadKg)}
                  >
                    <div
                      className={cn(
                        'flex h-16 w-full items-center gap-2 rounded-md border bg-background-main px-4',
                        'focus-within:border-border-focus focus-within:shadow-focus',
                        errores.cantidadKg ? 'border-error' : 'border-border',
                      )}
                    >
                      <input
                        inputMode="decimal"
                        aria-label="Cantidad en kilogramos"
                        placeholder="0,0"
                        className="min-w-0 flex-1 bg-transparent text-h1 tabular text-text-primary outline-none placeholder:text-text-disabled"
                        value={cantidadTexto}
                        onChange={(e) => escribirCantidad(e.target.value)}
                      />
                      <span className="shrink-0 text-body-md text-text-secondary">kg</span>
                    </div>
                  </FieldShell>
                  <Controller
                    control={form.control}
                    name="sabor"
                    render={({ field }) => (
                      <Select
                        label="Sabor / producto"
                        hint={errores.sabor?.message ?? 'Precargado desde la OF'}
                        placeholder="Selecciona el producto"
                        destructive={Boolean(errores.sabor)}
                        options={(productos?.data ?? []).map((p) => ({
                          value: p.nombre,
                          label: p.nombre,
                        }))}
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    )}
                  />
                </div>
                <TecladoNumerico
                  onTecla={(t) => escribirCantidad(cantidadTexto + t)}
                  onBorrar={() => escribirCantidad(cantidadTexto.slice(0, -1))}
                />
              </div>
            </>
          )}

          {paso === 1 && (
            <>
              <ContextoCaptura
                items={[
                  contexto.etiqueta,
                  contexto.ordenCodigo ?? 'Sin orden activa',
                  `${valores.tipo} · ${TIPO_MERMA_LABEL[valores.tipo]}`,
                  `${formatNumber(valores.cantidadKg, 1)} kg`,
                ]}
              />
              <p className="text-h4 text-text-primary">¿Cuál fue la causa?</p>
              <div className="flex flex-wrap gap-2">
                {causasAplicables.map((c) => (
                  <Tag
                    key={c.id}
                    size="lg"
                    selected={valores.causaId === c.id}
                    onClick={() => form.setValue('causaId', c.id, { shouldValidate: true })}
                  >
                    {etiquetaCausa(c)}
                  </Tag>
                ))}
              </div>
              {errores.causaId && (
                <p className="text-body-sm text-error-text">{errores.causaId.message}</p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="responsableId"
                  render={({ field }) => (
                    <Select
                      label="Responsable"
                      hint={errores.responsableId?.message ?? `Turno ${contexto.turnoLabel}`}
                      placeholder="Selecciona al responsable"
                      destructive={Boolean(errores.responsableId)}
                      options={(personas?.data ?? []).map((p) => ({
                        value: p.id,
                        label: `${p.nombre} · ${p.cargo}`,
                      }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <Input
                  label="Código de balde"
                  placeholder="BLD-2026-0344"
                  leadingIcon={<Icon name="scan-qr-code" size={16} />}
                  hint="Escanear código QR del balde"
                  {...form.register('codigoBalde')}
                />
              </div>
              <Controller
                control={form.control}
                name="enviarPasteurizacion"
                render={({ field }) => (
                  <Checkbox
                    label="Enviar a pasteurización"
                    supporting="El balde queda disponible para reproceso en el almacén de mermas (módulo de pasteurización del sistema actual)"
                    checked={field.value ?? false}
                    onCheckedChange={(v) => field.onChange(v === true)}
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
                    { label: 'Orden de fabricación', value: contexto.ordenCodigo ?? '—' },
                    {
                      label: 'Tipo de merma',
                      value: `${valores.tipo} · ${TIPO_MERMA_LABEL[valores.tipo]}`,
                    },
                    { label: 'Cantidad', value: `${formatNumber(valores.cantidadKg, 1)} kg` },
                    { label: 'Sabor / producto', value: valores.sabor },
                    { label: 'Causa', value: causaActual ? etiquetaCausa(causaActual) : '—' },
                    {
                      label: 'Responsable',
                      value: responsable ? `${responsable.nombre} · ${responsable.cargo}` : '—',
                    },
                    { label: 'Código de balde', value: valores.codigoBalde || '—' },
                    {
                      label: 'Pasteurización',
                      value: valores.enviarPasteurizacion
                        ? 'Se enviará al Pasteurizador PT-01'
                        : 'No aplica',
                    },
                  ]}
                />
              </div>
              <p className="text-body-sm text-text-disabled">
                Se registrará con sello de tiempo y quedará disponible en el repositorio de
                evidencia.
              </p>
            </>
          )}
        </form>
      </ModalContent>
    </Modal>
  );
}
