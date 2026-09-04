'use client';

import * as React from 'react';
import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { Maquina } from '@mes/types';
import { useBajaMaquina } from '@/features/catalogs/hooks';

export interface EliminarMaquinaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maquina: Maquina;
  /** Se ejecuta cuando la baja termina bien (la vista limpia su selección). */
  onEliminada: () => void;
}

/**
 * `Configuración / Máquinas` — Modal Kind=Danger de la baja lógica de una
 * máquina (`DELETE /maquinas/:id`, pasa a estado `baja`).
 *
 * Mismo patrón que `EliminarProductoModal`: no reutiliza `EliminarCausaModal`
 * porque ese componente fija el copy de éxito en «Causa … dada de baja», y el
 * nº de paradas que conservan el código solo se conoce en la respuesta del
 * `DELETE` (`BajaLogicaResponse`), así que se muestra en el toast, no antes
 * de confirmar.
 */
export function EliminarMaquinaModal({
  open,
  onOpenChange,
  maquina,
  onEliminada,
}: EliminarMaquinaModalProps) {
  const bajaMaquina = useBajaMaquina();
  const [enviando, setEnviando] = React.useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      const respuesta = await bajaMaquina.mutateAsync(maquina.id);
      toast.success(`Máquina ${respuesta.codigo} dada de baja`, { description: respuesta.mensaje });
      onEliminada();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo eliminar la máquina', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`¿Eliminar ${maquina.codigo} · ${maquina.nombre}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={enviando} onClick={() => void confirmar()}>
              Eliminar máquina
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción no se puede deshacer</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            Las paradas que ya la registraron conservan el código {maquina.codigo} para no romper la
            trazabilidad, pero la máquina dejará de estar disponible al registrar nuevas paradas,
            mermas u órdenes.
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
