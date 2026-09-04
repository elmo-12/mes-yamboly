'use client';

import * as React from 'react';
import { Button, Input, Modal, ModalClose, ModalContent, toast } from '@mes/ui';
import { crearInvitacionSchema } from '@mes/types';
import { useCrearInvitacion } from '../hooks';

export interface NuevaInvitacionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Crea una invitación nominal a la encuesta de satisfacción (Anexo 04). El
 * token es de un solo uso: la respuesta se cuenta una vez por invitado.
 */
export function NuevaInvitacionModal({ open, onOpenChange }: NuevaInvitacionModalProps) {
  const crear = useCrearInvitacion();
  const [invitado, setInvitado] = React.useState('');
  const [rol, setRol] = React.useState('');
  const [errores, setErrores] = React.useState<{ invitado?: string; rol?: string }>({});

  React.useEffect(() => {
    if (!open) return;
    setInvitado('');
    setRol('');
    setErrores({});
  }, [open]);

  const enviar = async () => {
    const validado = crearInvitacionSchema.safeParse({
      invitado: invitado.trim(),
      rol: rol.trim() || undefined,
    });
    if (!validado.success) {
      const campos: { invitado?: string; rol?: string } = {};
      for (const issue of validado.error.issues) {
        const campo = issue.path[0];
        if (campo === 'invitado' || campo === 'rol') campos[campo] = issue.message;
      }
      setErrores(campos);
      return;
    }
    setErrores({});

    try {
      const { invitacion } = await crear.mutateAsync(validado.data);
      toast.success(`Invitación creada para ${invitacion.invitado}`, {
        description: 'Copia el enlace desde la tabla y compártelo con la persona.',
      });
      onOpenChange(false);
    } catch (e) {
      toast.error('No se pudo crear la invitación', {
        description: e instanceof Error ? e.message : 'Reintenta en unos segundos.',
      });
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="sm"
        title="Nueva invitación a la encuesta"
        description="Genera un enlace de un solo uso para que la persona responda el cuestionario del Anexo 04."
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary" type="button">
                Cancelar
              </Button>
            </ModalClose>
            <Button variant="primary" onClick={enviar} loading={crear.isPending}>
              Crear invitación
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nombre del invitado"
            required
            value={invitado}
            maxLength={80}
            onChange={(e) => setInvitado(e.target.value)}
            destructive={Boolean(errores.invitado)}
            hint={errores.invitado ?? 'Como figura en el consentimiento informado.'}
            placeholder="Ej.: Luis Ramírez"
          />
          <Input
            label="Rol (opcional)"
            value={rol}
            maxLength={60}
            onChange={(e) => setRol(e.target.value)}
            destructive={Boolean(errores.rol)}
            hint={errores.rol ?? 'Maquinista, supervisor, jefe de producción…'}
            placeholder="Ej.: Maquinista"
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
