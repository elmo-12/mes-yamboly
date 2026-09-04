'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  DescriptionList,
  Icon,
  Input,
  Modal,
  ModalContent,
  Select,
  Stepper,
  TimerChip,
  toast,
} from '@mes/ui';
import { createOrdenSchema, type CreateOrdenInput } from '@mes/types';
import { formatDurationMin, formatNumber, formatSpeed, turnoPorHora } from '@mes/shared';
import {
  useColaboradores,
  useLineas,
  usePersonas,
  useProductos,
  useTurnos,
  useVelocidadesEstandar,
} from '@/features/catalogs/hooks';
import { useCrearOrden, useOrdenes } from '@/features/orders/hooks';
import { useSession } from '@/hooks/use-session';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';

const PASOS = [{ label: 'Datos' }, { label: 'Equipo' }, { label: 'Confirmar' }] as const;

const CAMPOS_PASO: Record<number, (keyof CreateOrdenInput)[]> = {
  0: ['lineaId', 'productoId', 'codigo', 'turno', 'lote', 'vencimiento', 'planificado'],
  1: ['maquinistaId', 'supervisorId', 'operarios'],
};

/** Paso al que hay que volver cuando el 422 del servidor señala un campo. */
function pasoDelCampo(campo: string): number {
  for (const [paso, campos] of Object.entries(CAMPOS_PASO)) {
    if ((campos as string[]).includes(campo)) return Number(paso);
  }
  return 0;
}

/** `OF-2026-0815` → `OF-2026-0816`. */
function siguienteCodigo(ultimo: string | undefined): string {
  const anio = new Date().getFullYear();
  if (!ultimo) return `OF-${anio}-0001`;
  const partes = ultimo.split('-');
  const correlativo = Number(partes[2] ?? '0') + 1;
  return `OF-${partes[1] ?? anio}-${String(correlativo).padStart(4, '0')}`;
}

function loteSugerido(): string {
  const hoy = new Date();
  const yy = String(hoy.getFullYear()).slice(2);
  return `L-${yy}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}-01`;
}

/** Turno sugerido por la hora de planta: `D` 06:00–18:00 · `N` 18:00–06:00. */
function turnoSugerido(): CreateOrdenInput['turno'] {
  return turnoPorHora(new Date().getHours());
}

function vencimientoSugerido(meses = 18): string {
  const f = new Date();
  f.setMonth(f.getMonth() + meses);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

export interface IniciarOrdenWizardProps {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Línea preseleccionada cuando se abre desde una Line card sin orden. */
  lineaId?: string;
}

/**
 * `Orden / Iniciar · P1 Datos · P2 Equipo · P3 Confirmar`
 * (Figma 2163:12873 / 2163:16326). Modal 640 con chip TRI.
 */
export function IniciarOrdenWizard({ abierto, onOpenChange, lineaId }: IniciarOrdenWizardProps) {
  const [paso, setPaso] = React.useState(0);
  const tri = useTriTimer(abierto);
  const { user } = useSession();
  const { data: lineas } = useLineas();
  const { data: turnos } = useTurnos();
  const { data: personas } = usePersonas();
  const { data: colaboradores } = useColaboradores();
  const { data: ultimas } = useOrdenes({ pageSize: 1, sort: 'codigo', orden: 'desc' });
  const crear = useCrearOrden();

  const form = useForm<CreateOrdenInput>({
    resolver: zodResolver(createOrdenSchema),
    mode: 'onTouched',
    defaultValues: {
      lineaId: lineaId ?? '',
      productoId: '',
      codigo: '',
      lote: loteSugerido(),
      vencimiento: vencimientoSugerido(),
      turno: turnoSugerido(),
      planificado: 0,
      maquinistaId: '',
      supervisorId: '',
      operarios: 1,
      colaboradorIds: [],
      tiempoRegistroSeg: 0,
    },
  });

  const valores = form.watch();
  const errores = form.formState.errors;
  /* Sólo productos con par producto × línea activo en la línea elegida. */
  const { data: productos } = useProductos({ lineaId: valores.lineaId || undefined });
  /* La velocidad estándar vive en el par, nunca en el producto. */
  const { data: pares } = useVelocidadesEstandar(
    { productoId: valores.productoId, lineaId: valores.lineaId, estado: 'activo' },
    { enabled: Boolean(valores.productoId && valores.lineaId) },
  );
  const par = pares?.data.find(
    (v) => v.productoId === valores.productoId && v.lineaId === valores.lineaId,
  );
  const producto = productos?.data.find((p) => p.id === valores.productoId);
  const linea = lineas?.data.find((l) => l.id === valores.lineaId);
  const turno = turnos?.data.find((t) => t.codigo === valores.turno);
  const maquinista = personas?.data.find((p) => p.id === valores.maquinistaId);
  const supervisor = personas?.data.find((p) => p.id === valores.supervisorId);
  const codigoSugerido = siguienteCodigo(ultimas?.data[0]?.codigo);

  React.useEffect(() => {
    if (!abierto) return;
    setPaso(0);
    form.reset({
      lineaId: lineaId ?? '',
      productoId: '',
      codigo: codigoSugerido,
      lote: loteSugerido(),
      vencimiento: vencimientoSugerido(),
      turno: turnoSugerido(),
      planificado: 0,
      maquinistaId: '',
      supervisorId: '',
      operarios: 1,
      colaboradorIds: [],
    });
    /* `codigoSugerido` depende de una query: solo interesa el valor al abrir. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, lineaId]);

  React.useEffect(() => {
    if (!abierto || form.getValues('codigo')) return;
    form.setValue('codigo', codigoSugerido);
  }, [abierto, codigoSugerido, form]);

  /* `register` guarda el valor como texto: se normaliza antes de calcular. */
  const planificado = Number(valores.planificado) || 0;
  const operarios = Number(valores.operarios) || 0;
  /* El estándar del par está en u/min: unidades ÷ u/min = minutos. */
  const minutosEstimados =
    par && par.velocidadUnidMin > 0 && planificado > 0 ? planificado / par.velocidadUnidMin : 0;
  const velocidadTexto = par
    ? `${formatSpeed(par.velocidadUnidMin, 1)} · ${formatNumber(par.velocidadUnidHora)} u/h`
    : undefined;

  const siguiente = async () => {
    const ok = await form.trigger(CAMPOS_PASO[paso] ?? []);
    if (ok) setPaso((p) => p + 1);
  };

  const guardar = form.handleSubmit(async (values) => {
    const segundos = tri.detener();
    try {
      const orden = await crear.mutateAsync({ ...values, tiempoRegistroSeg: segundos });
      toast.success(`Orden ${orden.codigo} iniciada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      /* 422: el backend detalla el campo (p. ej. `productoId` sin velocidad
         estándar en la línea); se pinta bajo el campo y se vuelve a su paso. */
      const campos = aplicarErroresApi<CreateOrdenInput>(e, form.setError);
      if (campos.length > 0) {
        setPaso(pasoDelCampo(campos[0] as string));
        toast.error('Revisa los campos marcados', { description: 'La orden no se inició.' });
      } else {
        toast.error(mensajeDeError(e, 'No se pudo iniciar la orden'));
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
          icon={<Icon name="play-circle" size={20} />}
          loading={crear.isPending}
          onClick={() => void guardar()}
        >
          Iniciar orden
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
        title="Iniciar orden de fabricación"
        aria-describedby={undefined}
        headerExtra={<TimerChip value={tri.etiqueta} />}
        footer={footer}
      >
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <Stepper steps={PASOS} current={paso} className="mx-auto max-w-[520px]" />

          {paso === 0 && (
            <>
              <div className="w-full rounded-sm bg-background-subtle px-3 py-2.5">
                <p className="text-body-sm text-text-secondary">
                  {[
                    'Planta Lima',
                    new Date().toLocaleDateString('es-PE'),
                    user ? `${user.nombre} (${user.cargo})` : '',
                  ]
                    .filter(Boolean)
                    .join('   ·   ')}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="lineaId"
                  render={({ field }) => (
                    <Select
                      label="Línea"
                      hint={errores.lineaId?.message ?? 'Línea de producción de la planta'}
                      placeholder="Selecciona la línea"
                      destructive={Boolean(errores.lineaId)}
                      options={(lineas?.data ?? []).map((l) => ({
                        value: l.id,
                        label: `${l.codigo} · ${l.nombre}`,
                      }))}
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        /* El par producto × línea cambia con la línea. */
                        form.setValue('productoId', '');
                        form.clearErrors('productoId');
                      }}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="productoId"
                  render={({ field }) => (
                    <Select
                      label="Producto"
                      hint={
                        errores.productoId?.message ??
                        (velocidadTexto
                          ? `Velocidad estándar ${velocidadTexto}`
                          : producto
                            ? 'Sin velocidad estándar en esta línea'
                            : valores.lineaId
                              ? 'Sólo productos con velocidad estándar en la línea'
                              : 'Elige primero la línea')
                      }
                      placeholder="Selecciona el producto"
                      disabled={!valores.lineaId}
                      destructive={Boolean(errores.productoId)}
                      options={(productos?.data ?? []).map((p) => ({
                        value: p.id,
                        label: p.nombre,
                      }))}
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.clearErrors('productoId');
                      }}
                    />
                  )}
                />
                <Input
                  label="N.º de OF"
                  hint={errores.codigo?.message ?? 'Correlativo sugerido'}
                  destructive={Boolean(errores.codigo)}
                  {...form.register('codigo')}
                />
                <Controller
                  control={form.control}
                  name="turno"
                  render={({ field }) => (
                    <Select
                      label="Turno"
                      hint={errores.turno?.message}
                      placeholder="Selecciona el turno"
                      destructive={Boolean(errores.turno)}
                      options={(turnos?.data ?? []).map((t) => ({
                        value: t.codigo,
                        label: `${t.label} · ${t.inicio}–${t.fin}`,
                      }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <Input
                  label="Lote"
                  hint={errores.lote?.message ?? 'Formato L-AAMMDD-NN'}
                  destructive={Boolean(errores.lote)}
                  {...form.register('lote')}
                />
                <Input
                  type="date"
                  label="Vencimiento"
                  hint={errores.vencimiento?.message ?? 'Vida útil 18 meses'}
                  destructive={Boolean(errores.vencimiento)}
                  {...form.register('vencimiento')}
                />
                <Input
                  inputMode="numeric"
                  label="Planificado (unidades)"
                  hint={
                    errores.planificado?.message ??
                    (minutosEstimados > 0
                      ? `≈ ${formatDurationMin(minutosEstimados)} a velocidad estándar`
                      : 'Objetivo de unidades del turno')
                  }
                  destructive={Boolean(errores.planificado)}
                  {...form.register('planificado')}
                />
              </div>
            </>
          )}

          {paso === 1 && (
            <>
              <div className="w-full rounded-sm bg-background-subtle px-3 py-2.5">
                <p className="text-body-sm text-text-secondary">
                  {[valores.codigo, linea ? `${linea.codigo} · ${linea.nombre}` : '', producto?.nombre, turno ? `Turno ${turno.label}` : '']
                    .filter(Boolean)
                    .join('   ·   ')}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="maquinistaId"
                  render={({ field }) => (
                    <Select
                      label="Maquinista"
                      hint={errores.maquinistaId?.message ?? 'Responsable del registro en línea'}
                      placeholder="Selecciona al maquinista"
                      destructive={Boolean(errores.maquinistaId)}
                      options={(personas?.data ?? [])
                        .filter((p) => p.rol === 'maquinista')
                        .map((p) => ({ value: p.id, label: p.nombre }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="supervisorId"
                  render={({ field }) => (
                    <Select
                      label="Supervisor de línea"
                      hint={errores.supervisorId?.message ?? 'Valida paradas y mermas'}
                      placeholder="Selecciona al supervisor"
                      destructive={Boolean(errores.supervisorId)}
                      options={(personas?.data ?? [])
                        .filter((p) => p.rol === 'supervisor' || p.rol === 'jefe')
                        .map((p) => ({ value: p.id, label: p.nombre }))}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="sm:w-1/2 sm:pr-2">
                <Input
                  inputMode="numeric"
                  label="N.º de operarios"
                  hint={errores.operarios?.message ?? 'Se calcula del listado marcado'}
                  destructive={Boolean(errores.operarios)}
                  {...form.register('operarios')}
                />
              </div>
              <p className="text-h4 text-text-primary">Colaboradores del turno</p>
              <Controller
                control={form.control}
                name="colaboradorIds"
                render={({ field }) => (
                  <div className="flex flex-col gap-3 rounded-md border border-border p-4">
                    {(colaboradores?.data ?? []).map((c) => (
                      <Checkbox
                        key={c.id}
                        label={c.nombre}
                        supporting={c.rol}
                        checked={field.value.includes(c.id)}
                        onCheckedChange={(v) => {
                          const siguienteLista =
                            v === true
                              ? [...field.value, c.id]
                              : field.value.filter((id) => id !== c.id);
                          field.onChange(siguienteLista);
                          form.setValue('operarios', Math.max(1, siguienteLista.length));
                        }}
                      />
                    ))}
                  </div>
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
                    { label: 'N.º de OF', value: valores.codigo },
                    { label: 'Línea', value: linea ? `${linea.codigo} · ${linea.nombre}` : '—' },
                    {
                      label: 'Producto',
                      value: producto
                        ? [producto.nombre, velocidadTexto].filter(Boolean).join(' · ')
                        : '—',
                    },
                    { label: 'Turno', value: turno ? `${turno.label} · ${turno.inicio}–${turno.fin}` : '—' },
                    { label: 'Lote / vencimiento', value: `${valores.lote} · ${valores.vencimiento}` },
                    {
                      label: 'Planificado',
                      value: `${formatNumber(planificado)} u${
                        minutosEstimados > 0 ? ` · ≈ ${formatDurationMin(minutosEstimados)}` : ''
                      }`,
                    },
                    { label: 'Maquinista', value: maquinista?.nombre ?? '—' },
                    { label: 'Supervisor', value: supervisor?.nombre ?? '—' },
                    {
                      label: 'Equipo',
                      value: `${formatNumber(operarios)} operarios · ${formatNumber(valores.colaboradorIds.length)} colaboradores marcados`,
                    },
                  ]}
                />
              </div>
              <p className="text-body-sm text-text-disabled">
                Al iniciar, la línea pasa a estado Produciendo y la orden queda En curso en el
                repositorio de órdenes.
              </p>
            </>
          )}
        </form>
      </ModalContent>
    </Modal>
  );
}
