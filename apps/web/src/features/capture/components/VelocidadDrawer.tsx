'use client';

import * as React from 'react';
import {
  Button,
  Drawer,
  DrawerContent,
  FieldShell,
  Icon,
  Overline,
  ProgressBar,
  Select,
  TimerChip,
  cn,
  toast,
} from '@mes/ui';
import { calcDesvioVelocidad, formatNumber } from '@mes/shared';
import { createVelocidadSchema } from '@mes/types';
import { useCausasParada } from '@/features/catalogs/hooks';
import { useCrearVelocidad } from '@/features/speeds/hooks';
import { useSession } from '@/hooks/use-session';
import { etiquetaCausa, todasLasEspecificas } from '../causas';
import type { ContextoLinea } from '../tipos';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import { ContextoCaptura } from './ContextoCaptura';
import { ApiClientError } from '@/services/api/client';
import { mensajeDeError } from '@/services/api/form-errors';

/** Tolerancia de velocidad admitida antes de exigir un motivo (spec 04.H). */
const TOLERANCIA_PCT = 5;

export interface VelocidadDrawerProps {
  contexto: ContextoLinea;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * `Velocidad / Registrar` (Figma 2163:12740): Drawer 480 con lectura real,
 * comparativa contra el estándar y motivo opcional cuando la línea va por
 * debajo de la tolerancia.
 */
export function VelocidadDrawer({ contexto, abierto, onOpenChange }: VelocidadDrawerProps) {
  const [texto, setTexto] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [error, setError] = React.useState<string>();
  const tri = useTriTimer(abierto);
  const { user } = useSession();
  const { data: arbol } = useCausasParada(contexto.lineaId);
  const crear = useCrearVelocidad();

  const velocidadRef = React.useRef(contexto.velocidad);
  velocidadRef.current = contexto.velocidad;

  /* Solo al abrir: el refresco de 5 s no debe pisar lo que escribe el operario. */
  React.useEffect(() => {
    if (!abierto) return;
    setTexto(velocidadRef.current > 0 ? String(velocidadRef.current) : '');
    setMotivo('');
    setError(undefined);
  }, [abierto]);

  const real = Number(texto.replace(',', '.')) || 0;
  const estandar = contexto.velocidadEstandar;
  const desvio = calcDesvioVelocidad(real, estandar);
  const maximo = Math.max(real, estandar, 1);
  const dentroDeTolerancia = Math.abs(desvio) <= TOLERANCIA_PCT;
  const motivos = React.useMemo(() => todasLasEspecificas(arbol?.data ?? []), [arbol]);

  const guardar = async () => {
    const parsed = createVelocidadSchema.safeParse({
      ordenId: contexto.ordenId ?? '',
      lineaId: contexto.lineaId,
      velocidadReal: real,
      motivo: motivo || undefined,
      responsableId: user?.id ?? '',
      tiempoRegistroSeg: 0,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    const segundos = tri.detener();
    try {
      await crear.mutateAsync({ ...parsed.data, tiempoRegistroSeg: segundos });
      toast.success(`Velocidad registrada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      /* Sin react-hook-form: el detalle del 422 se pinta en el error inline. */
      const detalle =
        e instanceof ApiClientError && e.statusCode === 422
          ? Object.values(e.details ?? {}).find((v): v is string => typeof v === 'string')
          : undefined;
      if (detalle) setError(detalle);
      toast.error(detalle ?? mensajeDeError(e, 'No se pudo registrar la velocidad'));
    }
  };

  return (
    <Drawer open={abierto} onOpenChange={onOpenChange}>
      <DrawerContent
        title="Registrar velocidad"
        aria-describedby={undefined}
        headerExtra={<TimerChip value={tri.etiqueta} />}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<Icon name="save" size={20} />}
              loading={crear.isPending}
              onClick={() => void guardar()}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ContextoCaptura
            items={[
              contexto.etiqueta,
              contexto.ordenCodigo ?? 'Sin orden activa',
              `Turno ${contexto.turnoLabel}`,
              new Date().toTimeString().slice(0, 5),
            ]}
          />

          <FieldShell
            label="Velocidad real"
            hint={error ?? 'Lectura del contador de la línea'}
            destructive={Boolean(error)}
          >
            <div
              className={cn(
                'flex h-16 w-full items-center gap-2 rounded-md border bg-background-main px-4',
                'focus-within:border-border-focus focus-within:shadow-focus',
                error ? 'border-error' : 'border-border',
              )}
            >
              <input
                inputMode="decimal"
                aria-label="Velocidad real en unidades por minuto"
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent text-h1 tabular text-text-primary outline-none placeholder:text-text-disabled"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value.replace(/[^0-9,]/g, ''));
                  setError(undefined);
                }}
              />
              <span className="shrink-0 text-body-md text-text-secondary">u/min</span>
            </div>
          </FieldShell>

          <div className="flex flex-col gap-3 rounded-md bg-background-subtle p-4">
            <Overline>Comparativo contra estándar</Overline>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body text-neutral-text">Real</span>
                <span className="text-body-md tabular text-text-primary">{real} u/min</span>
              </div>
              <ProgressBar value={(real / maximo) * 100} tone="primary" label="Velocidad real" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body text-neutral-text">Estándar</span>
                <span className="text-body-md tabular text-text-primary">{estandar} u/min</span>
              </div>
              <ProgressBar
                value={(estandar / maximo) * 100}
                tone="neutral"
                label="Velocidad estándar"
              />
            </div>
            <p
              className={cn(
                'text-body-sm font-medium',
                dentroDeTolerancia ? 'text-success-text' : 'text-warning-text',
              )}
            >
              {`Desvío ${desvio > 0 ? '+' : ''}${formatNumber(desvio, 1)} % · ${
                dentroDeTolerancia
                  ? `dentro de tolerancia (±${TOLERANCIA_PCT} %)`
                  : `fuera de tolerancia (±${TOLERANCIA_PCT} %)`
              }`}
            </p>
          </div>

          <Select
            label="Motivo si es baja (opcional)"
            hint="Se usa para el análisis de causa raíz"
            placeholder="Selecciona el motivo"
            options={motivos.map((c) => ({ value: etiquetaCausa(c), label: etiquetaCausa(c) }))}
            value={motivo}
            onValueChange={setMotivo}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
