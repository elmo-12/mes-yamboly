'use client';

import * as React from 'react';
import { Button, Icon, Input, Modal, ModalContent, Overline, TimerChip, toast } from '@mes/ui';
import { formatDuration } from '@mes/shared';
import { useFinalizarParada, useParadas } from '@/features/downtimes/hooks';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';
import type { ContextoLinea } from '../tipos';
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
  const tri = useTriTimer(abierto);
  const { data, isPending } = useParadas({ lineaId: contexto.lineaId, abiertas: true, pageSize: 1 });
  const finalizar = useFinalizarParada();
  const parada = data?.data[0];

  React.useEffect(() => {
    if (!abierto) {
      setComentario('');
      return;
    }
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [abierto]);

  const inicioMs = parada ? new Date(parada.inicio).getTime() : null;
  const duracionSeg = inicioMs ? Math.max(0, Math.floor((ahora - inicioMs) / 1000)) : 0;
  const titulo = parada
    ? `Finalizar parada ${parada.tipoCausaCodigo} · ${contexto.lineaCodigo}`
    : `Finalizar parada · ${contexto.lineaCodigo}`;

  const guardar = async () => {
    if (!parada) return;
    const segundos = tri.detener();
    const fin = new Date();
    try {
      await finalizar.mutateAsync({
        id: parada.id,
        input: {
          fin: `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}T${fin.toTimeString().slice(0, 8)}`,
          comentarioCierre: comentario || undefined,
        },
      });
      toast.success(`Parada finalizada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo finalizar la parada');
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
              disabled={!parada}
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
              parada?.maquinaNombre ?? '',
              parada?.responsableNombre ?? '',
            ]}
          />
          <div className="flex flex-col gap-1 rounded-md bg-error-subtle p-4">
            <Overline className="text-error-text">Duración de la parada</Overline>
            <p className="text-h1 tabular text-error">{formatDuration(duracionSeg)}</p>
            <p className="text-body-sm text-error-text">
              {parada
                ? `Inicio ${parada.inicio.slice(11, 19)} · ${new Date(ahora).toTimeString().slice(0, 8)} · cronómetro en vivo`
                : isPending
                  ? 'Buscando la parada abierta de la línea…'
                  : 'Esta línea no tiene ninguna parada abierta.'}
            </p>
          </div>
          <Input
            label="Comentario de cierre"
            placeholder="Ej.: Línea reiniciada con cadena nueva; se verificó tensión y sellado."
            hint="Opcional · se adjunta al registro de la parada"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
