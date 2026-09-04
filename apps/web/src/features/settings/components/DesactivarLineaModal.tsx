'use client';

import * as React from 'react';
import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { Linea } from '@mes/types';
import { useBajaLinea } from '@/features/catalogs/hooks';

export interface DesactivarLineaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linea: Linea;
  /** Se ejecuta cuando la baja termina bien (la vista limpia su selección). */
  onDesactivada: () => void;
}

/**
 * `Configuración / Líneas` — Modal Kind=Danger de la baja lógica de una línea
 * (`DELETE /lineas/:id`, pasa a estado `inactivo`).
 *
 * Nunca hay borrado físico: el nº de órdenes y paradas que conservan el código
 * solo se conoce en la respuesta del `DELETE` (`BajaLogicaResponse`), así que
 * se muestra en el toast, no antes de confirmar.
 */
export function DesactivarLineaModal({
  open,
  onOpenChange,
  linea,
  onDesactivada,
}: DesactivarLineaModalProps) {
  const bajaLinea = useBajaLinea();
  const [enviando, setEnviando] = React.useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      const respuesta = await bajaLinea.mutateAsync(linea.id);
      toast.success(`Línea ${respuesta.codigo} desactivada`, { description: respuesta.mensaje });
      onDesactivada();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo desactivar la línea', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`¿Desactivar ${linea.codigo} · ${linea.nombre}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={enviando} onClick={() => void confirmar()}>
              Desactivar línea
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción no se puede deshacer</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            Las órdenes y paradas ya registradas conservan el código {linea.codigo} para no romper
            la trazabilidad, pero la línea dejará de estar disponible al crear nuevas órdenes,
            paradas, mermas y velocidades estándar.
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
