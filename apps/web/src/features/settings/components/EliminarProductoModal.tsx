'use client';

import * as React from 'react';
import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { Producto } from '@mes/types';
import { useBajaProducto } from '@/features/catalogs/hooks';

export interface EliminarProductoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producto: Producto;
  /** Se ejecuta cuando la baja termina bien (la vista limpia su selección). */
  onEliminado: () => void;
}

/**
 * `Configuración / Productos y velocidades` — Modal Kind=Danger de la baja
 * lógica de un producto (`DELETE /productos/:id`).
 *
 * No reutiliza `EliminarCausaModal`: ese componente fija el copy de éxito en
 * «Causa … dada de baja», que sería incorrecto para un producto, y el nº de
 * pares producto × línea / órdenes que conservan el código solo se conoce en
 * la respuesta del `DELETE` (no antes, como sí ocurre con las causas, que ya
 * traen `paradasHistoricas`/`mermasHistoricas` en el listado). Por eso el
 * texto previo a confirmar es genérico y el detalle real (`BajaLogicaResponse`)
 * se muestra en el toast de éxito.
 */
export function EliminarProductoModal({
  open,
  onOpenChange,
  producto,
  onEliminado,
}: EliminarProductoModalProps) {
  const bajaProducto = useBajaProducto();
  const [enviando, setEnviando] = React.useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      const respuesta = await bajaProducto.mutateAsync(producto.id);
      toast.success(`Producto ${respuesta.codigo} dado de baja`, { description: respuesta.mensaje });
      onEliminado();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo eliminar el producto', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`¿Eliminar ${producto.codigo} · ${producto.nombre}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={enviando} onClick={() => void confirmar()}>
              Eliminar producto
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción no se puede deshacer</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            Sus velocidades estándar por línea y las órdenes que ya lo usaron conservan el código{' '}
            {producto.codigo} para no romper la trazabilidad, pero el producto dejará de estar
            disponible para nuevas velocidades y órdenes.
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
