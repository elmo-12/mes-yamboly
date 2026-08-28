'use client';

import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { CausaParada } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useEliminarCausaParada } from '@/features/catalogs/hooks';

export interface EliminarCausaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  causa: CausaParada;
  onEliminada: () => void;
}

/**
 * `Configuración / Eliminar causa` (Figma 2165:13853) — Modal Kind=Danger.
 * El `DELETE` del contrato es una baja lógica: las paradas históricas
 * conservan el código para no romper la trazabilidad.
 */
export function EliminarCausaModal({
  open,
  onOpenChange,
  causa,
  onEliminada,
}: EliminarCausaModalProps) {
  const eliminar = useEliminarCausaParada();

  const confirmar = async () => {
    try {
      const respuesta = await eliminar.mutateAsync(causa.id);
      toast.success(`Causa ${respuesta.codigo} dada de baja`, {
        description: respuesta.mensaje,
      });
      onEliminada();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo eliminar la causa', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`¿Eliminar ${causa.codigo} · ${causa.nombre}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={eliminar.isPending} onClick={confirmar}>
              Eliminar causa
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción no se puede deshacer</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            {`Hay ${formatNumber(causa.paradasHistoricas)} paradas históricas registradas con esta causa; se conservarán con el código ${causa.codigo} para no romper la trazabilidad, pero la causa dejará de estar disponible para nuevos registros.`}
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
