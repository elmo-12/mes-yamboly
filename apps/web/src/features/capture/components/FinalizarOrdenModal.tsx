'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Icon,
  Input,
  Modal,
  ModalContent,
  Overline,
  Textarea,
  TimerChip,
  cn,
  toast,
} from '@mes/ui';
import { computeOee, formatNumber, formatPct, formatSpeed } from '@mes/shared';
import { finalizeOrdenSchema, type FinalizeOrdenInput } from '@mes/types';
import { useFinalizarOrden, useOrden, useOrdenMermas, useOrdenParadas } from '@/features/orders/hooks';
import type { ContextoLinea } from '../tipos';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import { AdjuntarFoto } from './AdjuntarFoto';
import { ContextoCaptura } from './ContextoCaptura';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';

/** Minutos programados de un turno de planta (D 06:00–18:00 / N 18:00–06:00). */
const MINUTOS_TURNO = 720;
/** Tolerancia del control cruzado producción ↔ codificadora (spec 04.J). */
const TOLERANCIA_CONTEO_PCT = 0.5;

export interface FinalizarOrdenModalProps {
  contexto: ContextoLinea;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * `Orden / Finalizar` (Figma 2163:16222): control cruzado de conteo, evidencia
 * de etiqueta, comentario y OEE estimado del turno (3 mini KPI).
 */
export function FinalizarOrdenModal({ contexto, abierto, onOpenChange }: FinalizarOrdenModalProps) {
  const [fotoNombre, setFotoNombre] = React.useState<string>();
  const tri = useTriTimer(abierto);
  const ordenId = contexto.ordenId ?? '';
  const { data: orden } = useOrden(abierto ? ordenId : undefined);
  const { data: paradas } = useOrdenParadas(abierto ? ordenId : undefined);
  const { data: mermas } = useOrdenMermas(abierto ? ordenId : undefined);
  const finalizar = useFinalizarOrden(ordenId);

  const form = useForm<FinalizeOrdenInput>({
    resolver: zodResolver(finalizeOrdenSchema),
    mode: 'onTouched',
    defaultValues: { producido: 0, conteoCodificadora: 0, comentario: '', tiempoRegistroSeg: 0 },
  });

  const producidoRef = React.useRef(contexto.producido);
  producidoRef.current = orden?.producido ?? contexto.producido;

  /* Solo al abrir: el refresco de 5 s no debe pisar lo que escribe el operario. */
  React.useEffect(() => {
    if (!abierto) return;
    setFotoNombre(undefined);
    form.reset({
      producido: producidoRef.current,
      conteoCodificadora: producidoRef.current,
      comentario: '',
      tiempoRegistroSeg: 0,
    });
  }, [abierto, form]);

  const valores = form.watch();
  const errores = form.formState.errors;
  const producido = Number(valores.producido) || 0;
  const conteo = Number(valores.conteoCodificadora) || 0;
  const diferencia = producido - conteo;
  const diferenciaPct = producido > 0 ? Math.abs((diferencia / producido) * 100) : 0;
  const dentroDeTolerancia = diferenciaPct <= TOLERANCIA_CONTEO_PCT;
  const paradasMin = paradas?.resumen.minutos ?? 0;
  const mermaKg = mermas?.resumen.kg ?? 0;
  /* Estándar congelado en la orden al iniciarla (u/min del par producto × línea). */
  const velocidadEstandar = orden?.velocidadEstandar ?? contexto.velocidadEstandar;

  const oee = computeOee({
    tiempoPlanificadoMin: MINUTOS_TURNO,
    paradasMin,
    unidadesProducidas: producido,
    unidadesBuenas: Math.min(producido, conteo),
    velocidadEstandar,
  });

  const guardar = form.handleSubmit(async (values) => {
    const segundos = tri.detener();
    try {
      await finalizar.mutateAsync({
        ...values,
        comentario: values.comentario || undefined,
        evidenciaUrl: fotoNombre ? `evidencia/${fotoNombre}` : undefined,
        tiempoRegistroSeg: segundos,
      });
      toast.success(
        `Orden ${contexto.ordenCodigo ?? ''} finalizada en ${formatTriCorto(segundos)}`.trim(),
      );
      onOpenChange(false);
    } catch (e) {
      const campos = aplicarErroresApi<FinalizeOrdenInput>(e, form.setError);
      toast.error(
        campos.length > 0 ? 'Revisa los campos marcados' : mensajeDeError(e, 'No se pudo finalizar la orden'),
      );
    }
  });

  return (
    <Modal open={abierto} onOpenChange={onOpenChange}>
      <ModalContent
        size="lg"
        title={`Finalizar orden ${contexto.ordenCodigo ?? ''}`.trim()}
        aria-describedby={undefined}
        headerExtra={<TimerChip value={tri.etiqueta} />}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<Icon name="check" size={20} />}
              loading={finalizar.isPending}
              onClick={() => void guardar()}
            >
              Finalizar orden
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <ContextoCaptura
            items={[
              contexto.etiqueta,
              contexto.productoNombre ?? '',
              orden ? `Inicio ${orden.inicio.slice(11, 16)}` : '',
              `Cierre ${new Date().toTimeString().slice(0, 5)}`,
              `Turno ${contexto.turnoLabel}`,
            ]}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              inputMode="numeric"
              label="Total producido (unidades)"
              hint={
                errores.producido?.message ??
                `Planificado ${formatNumber(orden?.planificado ?? contexto.plan)} u`
              }
              destructive={Boolean(errores.producido)}
              {...form.register('producido')}
            />
            <Input
              inputMode="numeric"
              label="Conteo de codificadora"
              hint={errores.conteoCodificadora?.message ?? 'Lectura del equipo codificador'}
              destructive={Boolean(errores.conteoCodificadora)}
              {...form.register('conteoCodificadora')}
            />
          </div>
          <p
            className={cn(
              'text-body-sm font-medium',
              dentroDeTolerancia ? 'text-success-text' : 'text-warning-text',
            )}
          >
            {`Diferencia ${formatNumber(Math.abs(diferencia))} u (${formatNumber(diferenciaPct, 1)} %) — ${
              dentroDeTolerancia ? 'dentro' : 'fuera'
            } de la tolerancia de conteo (±${formatNumber(TOLERANCIA_CONTEO_PCT, 1)} %).`}
          </p>
          <AdjuntarFoto
            label="Evidencia · foto de etiqueta"
            cta="Adjuntar foto de etiqueta"
            value={fotoNombre}
            onChange={setFotoNombre}
          />
          <Textarea
            rows={3}
            label="Comentario de cierre"
            placeholder="Ej.: Se cerró la orden con 2 paradas registradas (PM-01 y PC-04)."
            hint={errores.comentario?.message ?? 'Se adjunta al expediente de la orden'}
            destructive={Boolean(errores.comentario)}
            {...form.register('comentario')}
          />
          <div className="flex flex-col gap-2">
            <Overline>{`OEE estimado del turno · ${formatPct(oee.oee)}`}</Overline>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MiniKpi
                label="Disponibilidad"
                value={formatPct(oee.disponibilidad)}
                nota={`${formatNumber(paradasMin)} min de paradas`}
              />
              <MiniKpi
                label="Rendimiento"
                value={formatPct(oee.desempeno)}
                nota={`objetivo ${formatSpeed(velocidadEstandar, 1)}`}
              />
              <MiniKpi
                label="Calidad"
                value={formatPct(oee.calidad)}
                nota={`${formatNumber(mermaKg, 1)} kg de merma`}
              />
            </div>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

function MiniKpi({ label, value, nota }: { label: string; value: string; nota: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-4">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span className="text-metric-sm tabular text-text-primary">{value}</span>
      <span className="text-body-sm text-text-disabled">{nota}</span>
    </div>
  );
}
