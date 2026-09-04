'use client';

import * as React from 'react';
import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { Producto, VelocidadEstandarListItem } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useBajaVelocidadEstandar } from '@/features/catalogs/hooks';

export interface EliminarVelocidadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Producto;
  /** Par producto × línea que se da de baja. */
  velocidad: VelocidadEstandarListItem;
  /** Se ejecuta cuando la baja termina bien (la matriz limpia su selección). */
  onEliminada: () => void;
}

/**
 * `Configuración / Productos y velocidades` — Modal Kind=Danger de la baja
 * lógica del par producto × línea (`DELETE /velocidades-estandar/:id`).
 *
 * Mismo patrón que `EliminarProductoModal`: el nº de órdenes que conservan la
 * velocidad congelada solo se conoce en la respuesta del `DELETE`
 * (`BajaLogicaResponse`), así que se muestra en el toast de éxito.
 */
export function EliminarVelocidadModal({
  open,
  onOpenChange,
  producto,
  velocidad,
  onEliminada,
}: EliminarVelocidadModalProps) {
  const baja = useBajaVelocidadEstandar();
  const [enviando, setEnviando] = React.useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      const respuesta = await baja.mutateAsync(velocidad.id);
      toast.success(`Par ${producto.codigo} × ${velocidad.lineaCodigo} dado de baja`, {
        description: respuesta.mensaje,
      });
      onEliminada();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo dar de baja la velocidad estándar', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`¿Dar de baja ${producto.codigo} × ${velocidad.lineaCodigo}?`}
        description={`${producto.nombre} · ${velocidad.lineaNombre}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={enviando} onClick={() => void confirmar()}>
              Dar de baja el par
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción no se puede deshacer</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            {velocidad.lineaNombre} dejará de ofrecer este producto al iniciar una orden. Las
            órdenes ya fabricadas conservan la velocidad congelada (
            {formatNumber(velocidad.velocidadUnidMin, 1)} u/min) para no alterar su OEE.
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
