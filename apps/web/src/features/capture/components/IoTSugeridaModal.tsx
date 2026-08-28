'use client';

import * as React from 'react';
import { Badge, Button, Icon, Modal, ModalContent, Tag, TimerChip, toast } from '@mes/ui';
import { useMaquinas, useCausasParada } from '@/features/catalogs/hooks';
import { useConfirmarDeteccion, useDescartarDeteccion } from '@/features/downtimes/hooks';
import { etiquetaCausa, tiposDeParada } from '../causas';
import type { ContextoLinea } from '../tipos';
import { formatTriCorto, useTriTimer } from '../use-tri-timer';

/** Causas más frecuentes ofrecidas en el modal de un toque (spec 04.K). */
const CAUSAS_RAPIDAS = ['PM-01', 'PC-04', 'PL-03', 'PA-05'] as const;

export interface IoTSugeridaModalProps {
  contexto: ContextoLinea;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
}

/**
 * `IoT / Parada sugerida` (Figma 2163:11217): confirmación en un toque de la
 * detección del sensor. "No es parada" descarta y realimenta el modelo.
 */
export function IoTSugeridaModal({ contexto, abierto, onOpenChange }: IoTSugeridaModalProps) {
  const [causaId, setCausaId] = React.useState('');
  const tri = useTriTimer(abierto);
  const { data: arbol } = useCausasParada(contexto.lineaId);
  const { data: maquinas } = useMaquinas(contexto.lineaId);
  const confirmar = useConfirmarDeteccion();
  const descartar = useDescartarDeteccion();

  const tipos = React.useMemo(() => tiposDeParada(arbol?.data ?? []), [arbol]);
  const rapidas = tipos.filter((t) => (CAUSAS_RAPIDAS as readonly string[]).includes(t.codigo));

  React.useEffect(() => {
    if (abierto) setCausaId('');
  }, [abierto]);

  const deteccionId = contexto.deteccionId;

  const onConfirmar = async () => {
    if (!deteccionId || !causaId) return;
    const segundos = tri.detener();
    try {
      await confirmar.mutateAsync({
        id: deteccionId,
        input: {
          causaId,
          maquinaId: maquinas?.data[0]?.id ?? '',
          accionTomada: 'Parada confirmada desde la detección del sensor IoT',
          tiempoRegistroSeg: segundos,
        },
      });
      toast.success(`Parada registrada en ${formatTriCorto(segundos)}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo confirmar la parada');
    }
  };

  const onDescartar = async () => {
    if (!deteccionId) return;
    try {
      await descartar.mutateAsync(deteccionId);
      toast.success('Detección descartada · se realimenta el modelo');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar la detección');
    }
  };

  return (
    <Modal open={abierto} onOpenChange={onOpenChange}>
      <ModalContent
        size="sm"
        title={`Parada sugerida en ${contexto.lineaCodigo}`}
        aria-describedby={undefined}
        headerExtra={<TimerChip value={tri.etiqueta} />}
        footer={
          <>
            <Button
              variant="secondary"
              size="lg"
              loading={descartar.isPending}
              onClick={() => void onDescartar()}
            >
              No es parada
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon={<Icon name="check" size={20} />}
              disabled={!causaId}
              loading={confirmar.isPending}
              onClick={() => void onConfirmar()}
            >
              Confirmar parada
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Badge color="informational" dot className="self-start">
            Detectada por sensor
          </Badge>
          <p className="text-body-lg text-text-primary">
            {contexto.deteccionTexto ??
              `El sensor de ${contexto.etiqueta} no registra movimiento.`}
          </p>
          <p className="text-body-sm text-text-secondary">
            Confirma la causa y la parada queda registrada en un toque.
          </p>
          <div className="flex flex-wrap gap-2">
            {rapidas.map((t) => (
              <Tag key={t.id} size="lg" selected={causaId === t.id} onClick={() => setCausaId(t.id)}>
                {etiquetaCausa(t)}
              </Tag>
            ))}
          </div>
          <p className="text-body-sm text-text-disabled">
            {[deteccionId ? `Evento ${deteccionId}` : '', maquinas?.data[0]?.nombre, `turno ${contexto.turnoLabel}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
