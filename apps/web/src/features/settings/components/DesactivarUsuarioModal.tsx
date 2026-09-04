'use client';

import * as React from 'react';
import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { User } from '@mes/types';
import { useCambiarEstadoUsuario } from '@/features/catalogs/hooks';

export interface DesactivarUsuarioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: User;
  /** Se ejecuta cuando la desactivación termina bien (la vista limpia su selección). */
  onDesactivado?: () => void;
}

/**
 * `Configuración / Sedes y usuarios` — Modal Kind=Danger para pasar un
 * usuario a `activo: false`. Reactivar es una acción de bajo riesgo y
 * reversible con un clic, así que no necesita confirmación ni modal propio.
 */
export function DesactivarUsuarioModal({
  open,
  onOpenChange,
  usuario,
  onDesactivado,
}: DesactivarUsuarioModalProps) {
  const cambiarEstado = useCambiarEstadoUsuario();
  const [enviando, setEnviando] = React.useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      await cambiarEstado.mutateAsync({ id: usuario.id, activo: false });
      toast.success(`${usuario.nombre} desactivado`, {
        description: 'Ya no podrá iniciar sesión; su historial de producción se conserva.',
      });
      onDesactivado?.();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo desactivar el usuario', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`¿Desactivar a ${usuario.nombre}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={enviando} onClick={() => void confirmar()}>
              Desactivar usuario
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción se puede revertir</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            {usuario.nombre} no podrá iniciar sesión en el MES hasta que un jefe lo reactive. Su
            historial de paradas, mermas y órdenes se conserva sin cambios.
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
