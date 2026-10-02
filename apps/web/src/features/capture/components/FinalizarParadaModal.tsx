'use client';

import * as React from 'react';
import { Button, Icon, Input, Modal, ModalContent, Overline, TimerChip, toast } from '@mes/ui';
import { formatDuration } from '@mes/shared';
import { puedeCapturar } from '@mes/types';
import { useSession } from '@/hooks/use-session';
import { ApiClientError } from '@/services/api/client';
import { mensajeDeError } from '@/services/api/form-errors';
import { useFinalizarParada, useParadas } from '@/features/downtimes/hooks';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import { ahoraLimaIso, msDesdeIsoLima, type ContextoLinea } from '../tipos';
import { ContextoCaptura } from './ContextoCaptura';

export interface FinalizarParadaModalProps {
  contexto: ContextoLinea;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * `Parada / Finalizar` (Figma 2163:2672): duración en vivo sobre fondo
 * `error/subtle`, comentario de cierre opcional y Primary "Finalizar parada".
 */
export function FinalizarParadaModal({ contexto, abierto, onOpenChange }: FinalizarParadaModalProps) {
  const [comentario, setComentario] = React.useState('');
  const [ahora, setAhora] = React.useState(() => Date.now());
  const [error, setError] = React.useState<string>();
  const tri = useTriTimer(abierto);
  const { user } = useSession();
  /* La parada abierta de la línea **en la orden en curso**: antes se tomaba la
     más reciente de la línea en cualquier orden y se podía cerrar otra. */
  const { data, isPending } = useParadas({
    ordenId: contexto.ordenId,
    lineaId: contexto.lineaId,
    abiertas: true,
    pageSize: 1,
  });
  const permitido = puedeCapturar(user, 'parada', contexto.lineaId);
  const finalizar = useFinalizarParada();
  const parada = contexto.ordenId ? data?.data[0] : undefined;

  React.useEffect(() => {
    if (!abierto) {
      setComentario('');
      setError(undefined);
      return;
    }
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [abierto]);

  /* El inicio es hora local de Lima: se interpreta en Lima, no en la zona de la tablet. */
  const inicioMs = parada ? msDesdeIsoLima(parada.inicio) : null;
  const duracionSeg = inicioMs ? Math.max(0, Math.floor((ahora - inicioMs) / 1000)) : 0;
  const titulo = parada
    ? `Finalizar parada ${parada.tipoCausaCodigo} · ${contexto.lineaCodigo}`
    : `Finalizar parada · ${contexto.lineaCodigo}`;

  const guardar = async () => {
    if (!parada || !permitido || finalizar.isPending) return;
    if (comentario.trim().length > 300) {
      setError('Máximo 300 caracteres');
      return;
    }
    const segundos = tri.detener();
    try {
      await finalizar.mutateAsync({
        id: parada.id,
        input: { fin: ahoraLimaIso(), comentarioCierre: comentario.trim() || undefined },
      });
      toast.success(`Parada finalizada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      const detalle =
        e instanceof ApiClientError && e.statusCode === 422
          ? Object.values(e.details ?? {}).find((v): v is string => typeof v === 'string')
          : undefined;
      if (detalle) setError(detalle);
      toast.error(detalle ?? mensajeDeError(e, 'No se pudo finalizar la parada'));
    }
  };

  return (
    <Modal open={abierto} onOpenChange={onOpenChange}>
      <ModalContent
        title={titulo}
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
              disabled={!parada || !permitido}
              loading={finalizar.isPending}
              onClick={() => void guardar()}
            >
              Finalizar parada
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <ContextoCaptura
            items={[
              contexto.etiqueta,
              contexto.ordenCodigo ?? 'Sin orden activa',
              parada?.responsableNombre ?? '',
            ]}
          />
          <div className="flex flex-col gap-1 rounded-md bg-error-subtle p-4">
            <Overline className="text-error-text">Duración de la parada</Overline>
            <p className="text-h1 tabular text-error">{formatDuration(duracionSeg)}</p>
            <p className="text-body-sm text-error-text">
              {parada
                ? `Inicio ${parada.inicio.slice(11, 19)} · ${ahoraLimaIso(new Date(ahora)).slice(11, 19)} · cronómetro en vivo`
                : !contexto.ordenId
                  ? 'Esta línea no tiene una orden en curso.'
                  : isPending
                  ? 'Buscando la parada abierta de la línea…'
                  : 'Esta línea no tiene ninguna parada abierta.'}
            </p>
          </div>
          <Input
            label="Comentario de cierre"
            placeholder="Ej.: Línea reiniciada con cadena nueva; se verificó tensión y sellado."
            hint={error ?? (permitido ? `Opcional · máximo 300 caracteres (${comentario.length}/300)` : 'Tu rol no permite cerrar paradas en esta línea.')}
            destructive={Boolean(error)}
            maxLength={300}
            value={comentario}
            onChange={(e) => {
              setComentario(e.target.value);
              setError(undefined);
            }}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
