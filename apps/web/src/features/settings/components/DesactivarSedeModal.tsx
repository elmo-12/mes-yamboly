'use client';

import * as React from 'react';
import { Button, Modal, ModalContent, Overline, toast } from '@mes/ui';
import type { Sede } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useActualizarSede } from '@/features/catalogs/hooks';

export interface DesactivarSedeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sede: Sede;
  /** Nº de usuarios asignados, para advertir del alcance antes de confirmar. */
  usuariosAsignados: number;
  /** Se ejecuta cuando la desactivación termina bien. */
  onDesactivada: () => void;
}

/**
 * `Configuración / Sedes y usuarios` — Modal Kind=Danger para pasar una sede a
 * `activa: false` (`PATCH /sedes/:id`). Mismo patrón que
 * `DesactivarUsuarioModal`: reactivar es reversible con un clic y no necesita
 * confirmación.
 */
export function DesactivarSedeModal({
  open,
  onOpenChange,
  sede,
  usuariosAsignados,
  onDesactivada,
}: DesactivarSedeModalProps) {
  const actualizar = useActualizarSede();
  const [enviando, setEnviando] = React.useState(false);

  const confirmar = async () => {
    setEnviando(true);
    try {
      await actualizar.mutateAsync({ id: sede.id, input: { activa: false } });
      toast.success(`Sede ${sede.codigo} desactivada`, {
        description: 'Deja de ofrecerse al crear usuarios; su histórico se conserva.',
      });
      onDesactivada();
      onOpenChange(false);
    } catch (error) {
      toast.error('No se pudo desactivar la sede', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title={`¿Desactivar ${sede.codigo} · ${sede.nombre}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={enviando} onClick={() => void confirmar()}>
              Desactivar sede
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <Overline>Esta acción se puede revertir</Overline>
          <p className="text-body leading-[22px] text-neutral-text">
            {sede.nombre} dejará de ofrecerse al dar de alta usuarios y líneas.{' '}
            {usuariosAsignados > 0
              ? `Las ${formatNumber(usuariosAsignados)} personas ya asignadas conservan su acceso y su historial.`
              : 'No hay personas asignadas a esta sede.'}
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
