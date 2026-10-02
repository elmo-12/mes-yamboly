'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
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
import {
  TIEMPO_REGISTRO_MAX_SEG,
  createOrdenSchema,
  type CreateOrdenInput,
  type OrdenSapListItem,
} from '@mes/types';
import { formatDurationMin, formatNumber, formatSpeed } from '@mes/shared';
import {
  useColaboradores,
  useLineas,
  usePersonas,
  useTurnos,
} from '@/features/catalogs/hooks';
import {
  SelectorOrdenSap,
  formatFechaSap,
  formatPlanificadoSap,
} from '@/features/orders/components/SelectorOrdenSap';
import { useCrearOrden } from '@/features/orders/hooks';
import { useSession } from '@/hooks/use-session';
import { ApiClientError } from '@/services/api/client';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { queryKeys } from '@/services/api/query-keys';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';

const PASOS = [{ label: 'Orden SAP' }, { label: 'Equipo' }, { label: 'Confirmar' }] as const;

const CAMPOS_PASO: Record<number, (keyof CreateOrdenInput)[]> = {
  0: ['ordenSapId', 'lote', 'vencimiento'],
  1: ['maquinistaId', 'supervisorId', 'operarios'],
};

/** Paso al que hay que volver cuando el 422 del servidor señala un campo. */
function pasoDelCampo(campo: string): number {
  for (const [paso, campos] of Object.entries(CAMPOS_PASO)) {
    if ((campos as string[]).includes(campo)) return Number(paso);
  }
  return 0;
}

function loteSugerido(): string {
  const hoy = new Date();
  const yy = String(hoy.getFullYear()).slice(2);
  return `L-${yy}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}-01`;
}

/** Vencimiento sugerido (vida útil 18 meses); lo comparten el wizard y /ordenes. */
export function vencimientoSugerido(meses = 18): string {
  const f = new Date();
  f.setMonth(f.getMonth() + meses);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

function valoresIniciales(): CreateOrdenInput {
  return {
    ordenSapId: '',
    lote: loteSugerido(),
    vencimiento: vencimientoSugerido(),
    maquinistaId: '',
    supervisorId: '',
    operarios: 1,
    colaboradorIds: [],
    tiempoRegistroSeg: 0,
  };
}

/**
 * Pista del planificado: duración estimada y avisos de plan anómalo (sin
 * velocidad: bloquea; 0 cajas o plan antiguo: sólo avisa).
 */
function avisoPlan(
  orden: OrdenSapListItem,
  minutosEstimados: number,
  velocidadTexto: string | undefined,
): string {
  if (orden.velocidadEstandar == null) {
    return 'Sin velocidad estándar en la línea ni en SAP: no podrá iniciarse';
  }
  const avisos: string[] = [];
  if (orden.planificadoCajas <= 0) avisos.push('Atención: la orden SAP planifica 0 cajas');
  const dias = diasDesde(orden.fecha);
  if (dias > DIAS_PLAN_ANTIGUO) avisos.push(`Atención: plan SAP de hace ${dias} días`);
  if (minutosEstimados > 0) {
    avisos.push(`≈ ${formatDurationMin(minutosEstimados)} a velocidad estándar (${velocidadTexto})`);
  }
  return avisos.join(' · ');
}

/** `380 u/min · par producto × línea` o `120 u/min · de la orden SAP`. */
function velocidadDeSap(orden: OrdenSapListItem | null): string | undefined {
  if (!orden || orden.velocidadEstandar == null) return undefined;
  const fuente = orden.velocidadFuente === 'par' ? 'par producto × línea' : 'de la orden SAP';
  return `${formatSpeed(orden.velocidadEstandar, 1)} · ${fuente}`;
}

export interface IniciarOrdenWizardProps {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Línea preseleccionada cuando se abre desde una Line card sin orden. */
  lineaId?: string;
  /** Título del modal (`Nueva orden de fabricación` en /ordenes). */
  titulo?: string;
  /**
   * Cronómetro TRI (Anexo 02). El alta desde /ordenes no es un registro de
   * planta: no mide ni crea fila de postest.
   */
  medirTri?: boolean;
}

/** Días tras los que un plan SAP pendiente se considera antiguo (aviso, no bloqueo). */
const DIAS_PLAN_ANTIGUO = 2;

function diasDesde(fecha: string): number {
  const d = new Date(`${fecha}T00:00:00`);
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/**
 * `Orden / Iniciar · P1 Orden SAP · P2 Equipo · P3 Confirmar`
 * (Figma 2163:12873 / 2163:16326). Modal 640 con chip TRI.
 *
 * Como en el sistema legado, la orden nace de una **orden SAP pendiente** de la
 * línea: línea, producto, turno, número de OF y planificado los fija SAP (el
 * servidor los deriva de la fila); aquí sólo se completan lote, vencimiento y
 * equipo.
 */
export function IniciarOrdenWizard({
  abierto,
  onOpenChange,
  lineaId,
  titulo = 'Iniciar orden de fabricación',
  medirTri = true,
}: IniciarOrdenWizardProps) {
  const [paso, setPaso] = React.useState(0);
  /* La línea no viaja en el cuerpo (la fija la orden SAP): sólo filtra la lista. */
  const [lineaSap, setLineaSap] = React.useState(lineaId ?? '');
  const [ordenSap, setOrdenSap] = React.useState<OrdenSapListItem | null>(null);
  const tri = useTriTimer(abierto && medirTri);
  const queryClient = useQueryClient();
  /* Bloqueo síncrono del envío: el doble clic llega antes que `isPending`. */
  const enviando = React.useRef(false);
  const { user } = useSession();
  const { data: lineas } = useLineas();
  const { data: turnos } = useTurnos();
  const { data: personas } = usePersonas();
  const { data: colaboradores } = useColaboradores();
  const crear = useCrearOrden();

  const form = useForm<CreateOrdenInput>({
    resolver: zodResolver(createOrdenSchema),
    mode: 'onTouched',
    defaultValues: valoresIniciales(),
  });

  const valores = form.watch();
  const errores = form.formState.errors;
  const linea = lineas?.data.find((l) => l.id === (ordenSap?.lineaId ?? lineaSap));
  const turno = turnos?.data.find((t) => t.codigo === ordenSap?.turno);
  const maquinista = personas?.data.find((p) => p.id === valores.maquinistaId);
  const supervisor = personas?.data.find((p) => p.id === valores.supervisorId);

  React.useEffect(() => {
    if (!abierto) return;
    setPaso(0);
    setLineaSap(lineaId ?? '');
    setOrdenSap(null);
    form.reset(valoresIniciales());
  }, [abierto, lineaId, form]);

  const elegirOrdenSap = (orden: OrdenSapListItem | null) => {
    setOrdenSap(orden);
    form.setValue('ordenSapId', orden?.id ?? '', { shouldValidate: Boolean(orden) });
    /* Al elegir otra fila o cambiar de línea, el error de la anterior no aplica. */
    form.clearErrors('ordenSapId');
  };

  /* Maquinistas de la línea de la orden SAP (todos si la línea no tiene ninguno asignado). */
  /* Sólo personas activas: un usuario desactivado no puede figurar en una orden nueva. */
  const activas = (personas?.data ?? []).filter((p) => p.activo !== false);
  const maquinistas = activas.filter((p) => p.rol === 'maquinista');
  const lineaObjetivo = ordenSap?.lineaId ?? lineaSap;
  const maquinistasLinea = maquinistas.filter((p) => p.lineaId === lineaObjetivo);
  const opcionesMaquinista = maquinistasLinea.length > 0 ? maquinistasLinea : maquinistas;

  /* `register` guarda el valor como texto: se normaliza antes de calcular. */
  const operarios = Number(valores.operarios) || 0;
  /* El estándar está en u/min: unidades ÷ u/min = minutos. */
  const minutosEstimados =
    ordenSap && ordenSap.velocidadEstandar && ordenSap.planificadoUnidades > 0
      ? ordenSap.planificadoUnidades / ordenSap.velocidadEstandar
      : 0;
  const velocidadTexto = velocidadDeSap(ordenSap);
  const planificadoTexto = ordenSap
    ? `${formatPlanificadoSap(ordenSap)}${
        minutosEstimados > 0 ? ` · ≈ ${formatDurationMin(minutosEstimados)}` : ''
      }`
    : '—';

  const siguiente = async () => {
    /* Sin velocidad estándar la orden no puede iniciarse: se avisa aquí, no al final. */
    if (paso === 0 && ordenSap && ordenSap.velocidadEstandar == null) {
      form.setError('ordenSapId', {
        message: 'Esta orden SAP no tiene velocidad estándar en la línea ni en SAP: no puede iniciarse',
      });
      return;
    }
    const ok = await form.trigger(CAMPOS_PASO[paso] ?? []);
    if (ok) setPaso((p) => p + 1);
  };

  const guardar = form.handleSubmit(async (values) => {
    if (enviando.current) return;
    enviando.current = true;
    const segundos = medirTri ? tri.detener() : 0;
    try {
      /* Un asistente abierto más de 1 h no mide el tiempo de registro: se
         descarta (0 = sin fila de postest) en vez de sesgar el TRI o dar 422. */
      const tiempoRegistroSeg = segundos > TIEMPO_REGISTRO_MAX_SEG ? 0 : segundos;
      const orden = await crear.mutateAsync({ ...values, tiempoRegistroSeg });
      toast.success(
        medirTri
          ? `Orden ${orden.codigo} iniciada en ${formatTriCorto(segundos)}`
          : `Orden ${orden.codigo} creada`,
        { description: `${orden.lineaCodigo} · ${orden.productoNombre}` },
      );
      onOpenChange(false);
    } catch (e) {
      /* 422: el backend detalla el campo (p. ej. `ordenSapId` sin velocidad
         estándar); se pinta bajo el campo y se vuelve a su paso. */
      const campos = aplicarErroresApi<CreateOrdenInput>(e, form.setError);
      if (campos.length > 0) {
        setPaso(pasoDelCampo(campos[0] as string));
        toast.error('Revisa los campos marcados', { description: 'La orden no se inició.' });
      } else if (e instanceof ApiClientError && e.statusCode === 409 && e.details?.ordenSapId) {
        /* Otra persona inició antes esa fila SAP: se refresca la lista y se
           vuelve a elegir (la fila consumida deja de ofrecerse). */
        void queryClient.invalidateQueries({ queryKey: queryKeys.ordenesSap.all });
        elegirOrdenSap(null);
        setPaso(0);
        form.setError('ordenSapId', { message: e.message });
        toast.error(e.message, { description: 'Elige otra orden SAP de la lista.' });
      } else {
        toast.error(mensajeDeError(e, 'No se pudo iniciar la orden'));
      }
    } finally {
      enviando.current = false;
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
          disabled={crear.isPending}
          onClick={() => void guardar()}
        >
          {medirTri ? 'Iniciar orden' : 'Crear orden'}
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
        title={titulo}
        aria-describedby={undefined}
        headerExtra={medirTri ? <TimerChip value={tri.etiqueta} /> : undefined}
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
              <SelectorOrdenSap
                lineaId={lineaSap}
                conSelectorLinea={!lineaId}
                onLineaChange={setLineaSap}
                value={valores.ordenSapId}
                onChange={elegirOrdenSap}
                error={errores.ordenSapId?.message}
              />
              {ordenSap && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    label="Planificado (SAP)"
                    readOnly
                    value={formatPlanificadoSap(ordenSap)}
                    hint={avisoPlan(ordenSap, minutosEstimados, velocidadTexto)}
                    destructive={ordenSap.velocidadEstandar == null}
                  />
                </div>
              )}
            </>
          )}

          {paso === 1 && (
            <>
              <div className="w-full rounded-sm bg-background-subtle px-3 py-2.5">
                <p className="text-body-sm text-text-secondary">
                  {[
                    ordenSap ? `# ${ordenSap.numero}` : '',
                    linea ? `${linea.codigo} · ${linea.nombre}` : '',
                    ordenSap?.productoNombre,
                    turno ? `Turno ${turno.label}` : '',
                  ]
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
                      options={opcionesMaquinista.map((p) => ({ value: p.id, label: p.nombre }))}
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
                      options={activas
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
                    { label: 'Orden SAP', value: ordenSap ? `# ${ordenSap.numero}` : '—' },
                    {
                      label: 'Plan SAP',
                      value: ordenSap
                        ? `${formatFechaSap(ordenSap.fecha)} · Turno ${turno ? `${turno.label} · ${turno.inicio}–${turno.fin}` : ordenSap.turno}`
                        : '—',
                    },
                    { label: 'Línea', value: linea ? `${linea.codigo} · ${linea.nombre}` : '—' },
                    {
                      label: 'Producto',
                      value: ordenSap
                        ? [`${ordenSap.codigoProducto} - ${ordenSap.productoNombre}`, velocidadTexto]
                            .filter(Boolean)
                            .join(' · ')
                        : '—',
                    },
                    { label: 'Lote / vencimiento', value: `${valores.lote} · ${valores.vencimiento}` },
                    { label: 'Planificado', value: planificadoTexto },
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
