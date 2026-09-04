'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  Textarea,
  TimerChip,
  cn,
  toast,
} from '@mes/ui';
import {
  TIPOS_MERMA,
  TIPO_MERMA_LABEL,
  createMermaSchema,
  type CausaMermaNodo,
  type CreateMermaInput,
  type TipoMermaCodigo,
} from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useCausasMermaArbol, usePersonas, useSabores } from '@/features/catalogs/hooks';
import { useCrearMerma } from '@/features/scrap/hooks';
import { useSession } from '@/hooks/use-session';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { etiquetaCausa, tiposDeMerma } from '../causas';
import type { ContextoLinea } from '../tipos';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import { AdjuntarFoto } from './AdjuntarFoto';
import { ContextoCaptura } from './ContextoCaptura';
import { TecladoNumerico } from './TecladoNumerico';

const PASOS = [{ label: 'Tipo' }, { label: 'Causa' }, { label: 'Confirmar' }] as const;

const CAMPOS_PASO: Record<number, (keyof CreateMermaInput)[]> = {
  0: ['tipo', 'cantidadKg', 'sabor'],
  1: ['tipoCausaId', 'clasificacionId', 'causaId', 'responsableId'],
};

/** Paso al que hay que volver cuando el 422 del servidor señala un campo. */
function pasoDelCampo(campo: string): number {
  for (const [paso, campos] of Object.entries(CAMPOS_PASO)) {
    if ((campos as string[]).includes(campo)) return Number(paso);
  }
  return 1;
}

/** Un nodo aplica al tipo de merma elegido (`aplicaA` vacío = todos). */
function aplicaAlTipo(nodo: CausaMermaNodo, tipo: TipoMermaCodigo): boolean {
  return nodo.estado === 'activo' && (nodo.aplicaA.length === 0 || nodo.aplicaA.includes(tipo));
}

/**
 * Reglas que dependen del catálogo (`requiereComentario` / `requiereSolicitud`
 * / `requiereEvidencia` de la causa elegida) y que por eso no viven en
 * `createMermaSchema`. Espejo del 422 de `ScrapService.validarCausa`.
 */
function reglasDeCausa(causa: CausaMermaNodo | undefined) {
  return z
    .object({
      observacion: z.string().optional(),
      numeroSolicitud: z.string().optional(),
      evidencia: z.string().optional(),
    })
    .superRefine((valores, ctx) => {
      if (!causa) return;
      if (causa.requiereComentario && !valores.observacion?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['observacion'],
          message: `La causa ${causa.codigo} exige un comentario`,
        });
      }
      if (causa.requiereSolicitud && !valores.numeroSolicitud?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['numeroSolicitud'],
          message: `La causa ${causa.codigo} exige un n.º de solicitud`,
        });
      }
      if (causa.requiereEvidencia && !valores.evidencia) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evidencia'],
          message: `La causa ${causa.codigo} exige una foto de evidencia`,
        });
      }
    });
}

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
  const [fotoNombre, setFotoNombre] = React.useState<string>();
  const [errorEvidencia, setErrorEvidencia] = React.useState<string>();
  const tri = useTriTimer(abierto);
  const { user } = useSession();
  /* El árbol llega ya filtrado por `lineasAplicables` de la línea del contexto. */
  const { data: arbol } = useCausasMermaArbol({ lineaId: contexto.lineaId });
  const { data: sabores } = useSabores({ estado: 'activo' });
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
      /* El sabor sale del catálogo (41 reales), no del producto de la OF. */
      sabor: '',
      tipoCausaId: '',
      clasificacionId: null,
      causaId: '',
      responsableId: usuarioIdRef.current ?? '',
      codigoBalde: '',
      numeroSolicitud: '',
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
    setFotoNombre(undefined);
    setErrorEvidencia(undefined);
    form.reset(defaults());
  }, [abierto, defaults, form]);

  const valores = form.watch();
  const errores = form.formState.errors;

  /* Selector jerárquico tipo → clasificación → causa (igual que en paradas). */
  const tipos = React.useMemo(
    () => tiposDeMerma(arbol?.data ?? []).filter((t) => aplicaAlTipo(t, valores.tipo)),
    [arbol, valores.tipo],
  );
  const tipoActual = tipos.find((t) => t.id === valores.tipoCausaId);
  const clasificaciones = React.useMemo(
    () =>
      (tipoActual?.hijos ?? []).filter(
        (c) =>
          c.nivel === 'clasificacion' &&
          aplicaAlTipo(c, valores.tipo) &&
          c.hijos.some((hoja) => hoja.nivel === 'causa' && aplicaAlTipo(hoja, valores.tipo)),
      ),
    [tipoActual, valores.tipo],
  );
  const clasificacionActual = clasificaciones.find((c) => c.id === valores.clasificacionId);
  const causasHoja = React.useMemo(
    () =>
      (clasificacionActual?.hijos ?? []).filter(
        (c) => c.nivel === 'causa' && aplicaAlTipo(c, valores.tipo),
      ),
    [clasificacionActual, valores.tipo],
  );
  const causaActual = causasHoja.find((c) => c.id === valores.causaId);
  const responsable = personas?.data.find((p) => p.id === valores.responsableId);

  /* El catálogo decide qué exige cada causa (mismo contrato que en paradas). */
  const requiereComentario = Boolean(causaActual?.requiereComentario);
  const requiereSolicitud = Boolean(causaActual?.requiereSolicitud);
  const requiereEvidencia = Boolean(causaActual?.requiereEvidencia);

  /** Cambiar de nivel invalida los inferiores: el par debe quedar consistente. */
  const elegirTipoCausa = (id: string) => {
    /* Vaciar no debe pintar el error de "obligatorio" antes de llegar al paso. */
    form.setValue('tipoCausaId', id, { shouldValidate: id !== '' });
    form.setValue('clasificacionId', null);
    form.setValue('causaId', '');
    form.clearErrors(['clasificacionId', 'causaId', 'observacion', 'numeroSolicitud']);
    if (id === '') form.clearErrors('tipoCausaId');
    setErrorEvidencia(undefined);
  };

  const escribirCantidad = (texto: string) => {
    const limpio = texto.replace(/[^0-9,]/g, '').replace(/(,.*),/g, '$1').slice(0, 7);
    setCantidadTexto(limpio);
    form.setValue('cantidadKg', Number(limpio.replace(',', '.')) || 0, { shouldValidate: true });
  };

  const siguiente = async () => {
    const ok = await form.trigger(CAMPOS_PASO[paso] ?? []);
    if (!ok) return;
    if (paso === 1) {
      if (clasificaciones.length > 0 && !valores.clasificacionId) {
        form.setError('clasificacionId', {
          type: 'required',
          message: 'Selecciona la clasificación',
        });
        return;
      }
      const extra = reglasDeCausa(causaActual).safeParse({
        observacion: valores.observacion,
        numeroSolicitud: valores.numeroSolicitud,
        evidencia: fotoNombre,
      });
      setErrorEvidencia(undefined);
      if (!extra.success) {
        for (const incidencia of extra.error.issues) {
          const campo = String(incidencia.path[0]);
          if (campo === 'evidencia') setErrorEvidencia(incidencia.message);
          else {
            form.setError(campo as 'observacion' | 'numeroSolicitud', {
              type: 'required',
              message: incidencia.message,
            });
          }
        }
        return;
      }
    }
    setPaso((p) => p + 1);
  };

  const guardar = form.handleSubmit(async (values) => {
    const segundos = tri.detener();
    try {
      await crear.mutateAsync({
        ...values,
        codigoBalde: values.codigoBalde || undefined,
        observacion: values.observacion || undefined,
        numeroSolicitud: values.numeroSolicitud || undefined,
        tiempoRegistroSeg: segundos,
      });
      toast.success(`Merma registrada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      /* 422: el backend detalla el campo (causa fuera del tipo, comentario o
         n.º de solicitud exigidos); se pinta bajo el campo y se vuelve al paso. */
      const campos = aplicarErroresApi<CreateMermaInput>(e, form.setError);
      if (campos.length > 0) {
        setPaso(pasoDelCampo(campos[0] as string));
        toast.error('Revisa los campos marcados', { description: 'La merma no se registró.' });
      } else {
        toast.error(mensajeDeError(e, 'No se pudo registrar la merma'));
      }
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
                      /* Cambiar MP/EP/PT cambia las causas aplicables. */
                      elegirTipoCausa('');
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
                        label="Sabor"
                        hint={errores.sabor?.message ?? 'Catálogo de sabores de planta'}
                        placeholder="Selecciona el sabor"
                        destructive={Boolean(errores.sabor)}
                        options={(sabores?.data ?? []).map((s) => ({
                          value: s.nombre,
                          label: s.nombre,
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
                {tipos.map((t) => (
                  <Tag
                    key={t.id}
                    size="lg"
                    selected={valores.tipoCausaId === t.id}
                    onClick={() => elegirTipoCausa(t.id)}
                  >
                    {etiquetaCausa(t)}
                  </Tag>
                ))}
              </div>
              {errores.tipoCausaId && (
                <p className="text-body-sm text-error-text">{errores.tipoCausaId.message}</p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="clasificacionId"
                  render={({ field }) => (
                    <Select
                      label="Clasificación"
                      hint={errores.clasificacionId?.message ?? 'Nivel intermedio del árbol'}
                      placeholder={tipoActual ? 'Selecciona la clasificación' : 'Elige primero el tipo'}
                      disabled={!tipoActual}
                      destructive={Boolean(errores.clasificacionId)}
                      options={clasificaciones.map((c) => ({
                        value: c.id,
                        label: etiquetaCausa(c),
                      }))}
                      value={field.value ?? ''}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue('causaId', '');
                        form.clearErrors(['clasificacionId', 'causaId']);
                      }}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="causaId"
                  render={({ field }) => (
                    <Select
                      label="Causa"
                      hint={errores.causaId?.message ?? 'Catálogo codificado de mermas'}
                      placeholder={
                        clasificacionActual ? 'Selecciona la causa' : 'Elige primero la clasificación'
                      }
                      disabled={!clasificacionActual}
                      destructive={Boolean(errores.causaId)}
                      options={causasHoja.map((c) => ({ value: c.id, label: etiquetaCausa(c) }))}
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.clearErrors(['observacion', 'numeroSolicitud']);
                        setErrorEvidencia(undefined);
                      }}
                    />
                  )}
                />
              </div>
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
              {(requiereSolicitud || requiereEvidencia) && (
                <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
                  {requiereSolicitud && (
                    <Input
                      label="N.º de solicitud"
                      placeholder="SM-4471"
                      hint={
                        errores.numeroSolicitud?.message ??
                        `Obligatorio para ${causaActual ? causaActual.codigo : 'esta causa'}`
                      }
                      destructive={Boolean(errores.numeroSolicitud)}
                      {...form.register('numeroSolicitud')}
                    />
                  )}
                  {requiereEvidencia && (
                    <div className="flex flex-col gap-1.5">
                      <AdjuntarFoto
                        label="Evidencia (foto)"
                        cta="Adjuntar foto"
                        value={fotoNombre}
                        onChange={(nombre) => {
                          setFotoNombre(nombre);
                          setErrorEvidencia(undefined);
                        }}
                      />
                      <p
                        className={cn(
                          'text-body-sm',
                          errorEvidencia ? 'text-error-text' : 'text-text-secondary',
                        )}
                      >
                        {errorEvidencia ?? 'Obligatoria para esta causa'}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <Textarea
                rows={2}
                label={requiereComentario ? 'Observación' : 'Observación (opcional)'}
                placeholder="Describe qué ocurrió con el producto"
                hint={
                  errores.observacion?.message ??
                  (requiereComentario
                    ? `Obligatoria para ${causaActual ? causaActual.codigo : 'esta causa'}`
                    : 'Máximo 300 caracteres')
                }
                destructive={Boolean(errores.observacion)}
                {...form.register('observacion')}
              />
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
                    { label: 'Sabor', value: valores.sabor || '—' },
                    {
                      label: 'Tipo de producción',
                      value: tipoActual ? etiquetaCausa(tipoActual) : '—',
                    },
                    {
                      label: 'Clasificación',
                      value: clasificacionActual ? etiquetaCausa(clasificacionActual) : '—',
                    },
                    { label: 'Causa', value: causaActual ? etiquetaCausa(causaActual) : '—' },
                    ...(valores.numeroSolicitud
                      ? [{ label: 'N.º de solicitud', value: valores.numeroSolicitud }]
                      : []),
                    ...(valores.observacion
                      ? [{ label: 'Observación', value: valores.observacion }]
                      : []),
                    {
                      label: 'Responsable',
                      value: responsable ? `${responsable.nombre} · ${responsable.cargo}` : '—',
                    },
                    { label: 'Código de balde', value: valores.codigoBalde || '—' },
                    {
                      label: 'Pasteurización',
                      value: valores.enviarPasteurizacion
                        ? 'Se enviará al almacén de mermas recuperables'
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
