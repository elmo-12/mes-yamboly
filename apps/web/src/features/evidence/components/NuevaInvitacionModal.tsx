'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Modal, ModalClose, ModalContent, Select, toast } from '@mes/ui';
import { ROLE_LABEL, crearInvitacionSchema } from '@mes/types';
import type { CrearInvitacionInput, InvitacionTSP } from '@mes/types';
import { useUsuarios } from '@/features/catalogs/hooks';
import { ApiClientError } from '@/services/api/client';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';
import { useCrearInvitacion } from '../hooks';

export interface NuevaInvitacionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Invitaciones ya emitidas (pendientes o respondidas): sus usuarios salen deshabilitados del selector. */
  invitaciones: InvitacionTSP[];
}

const DEFAULTS: CrearInvitacionInput = { usuarioId: '' };

/**
 * Crea una invitación nominal a la encuesta de satisfacción (Anexo 04) para un
 * usuario del MES. El token es de un solo uso: la respuesta se cuenta una vez
 * por invitado. `invitado`/`rol` ya no se escriben a mano: la API los deriva
 * de la cuenta del usuario elegido.
 */
export function NuevaInvitacionModal({ open, onOpenChange, invitaciones }: NuevaInvitacionModalProps) {
  const crear = useCrearInvitacion();
  const { data: usuarios } = useUsuarios({ activo: true });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<CrearInvitacionInput>({
    resolver: zodResolver(crearInvitacionSchema),
    defaultValues: DEFAULTS,
  });

  React.useEffect(() => {
    if (!open) reset(DEFAULTS);
  }, [open, reset]);

  /* Un usuario ya invitado (pendiente o respondida) no puede volver a elegirse. */
  const yaInvitados = React.useMemo(
    () => new Set(invitaciones.map((i) => i.usuarioId).filter((id): id is string => Boolean(id))),
    [invitaciones],
  );

  const listaUsuarios = usuarios?.data ?? [];
  const opciones = listaUsuarios.map((u) => {
    const invitado = yaInvitados.has(u.id);
    return {
      value: u.id,
      label: `${u.nombre} · ${ROLE_LABEL[u.rol]}${invitado ? ' — Ya invitado' : ''}`,
      disabled: invitado,
    };
  });

  const usuarioSeleccionado = listaUsuarios.find((u) => u.id === watch('usuarioId'));

  const enviar = handleSubmit(async (valores) => {
    try {
      const { invitacion } = await crear.mutateAsync(valores);
      toast.success(`Invitación creada para ${invitacion.invitado}`, {
        description: 'Copia el enlace desde la tabla y compártelo con la persona.',
      });
      onOpenChange(false);
    } catch (error) {
      const campos = aplicarErroresApi<CrearInvitacionInput>(error, setError);
      if (campos.length > 0) {
        toast.error('Revisa los campos marcados', { description: 'La invitación no se creó.' });
        return;
      }
      /* 409: el usuario ya tiene una invitación — el campo relevante viaja en `details`. */
      if (error instanceof ApiClientError && error.statusCode === 409 && error.details && 'usuarioId' in error.details) {
        setError('usuarioId', { type: 'server', message: error.message });
        toast.error('No se pudo crear la invitación', { description: error.message });
        return;
      }
      toast.error('No se pudo crear la invitación', {
        description: mensajeDeError(error, 'Reintenta en unos segundos.'),
      });
    }
  });

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
            <Button variant="primary" onClick={() => void enviar()} loading={crear.isPending}>
              Crear invitación
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Controller
            control={control}
            name="usuarioId"
            render={({ field }) => (
              <Select
                label="Usuario"
                placeholder="Selecciona un usuario"
                options={opciones}
                value={field.value}
                onValueChange={field.onChange}
                destructive={Boolean(errors.usuarioId)}
                hint={errors.usuarioId?.message ?? 'Solo usuarios activos del MES; el rol se toma de su cuenta.'}
              />
            )}
          />
          <Input
            label="Rol"
            value={usuarioSeleccionado ? ROLE_LABEL[usuarioSeleccionado.rol] : ''}
            disabled
            placeholder="Se completa al elegir un usuario"
            hint="No editable: se toma de la cuenta del usuario."
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
