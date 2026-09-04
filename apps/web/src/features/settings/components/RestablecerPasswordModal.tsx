'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Icon, Input, Modal, ModalContent, toast } from '@mes/ui';
import { restablecerPasswordSchema } from '@mes/types';
import type { RestablecerPasswordInput, User } from '@mes/types';
import { useRestablecerPassword } from '@/features/catalogs/hooks';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';

const DEFAULT_VALUES: RestablecerPasswordInput = { password: '', confirmacion: '' };

export interface RestablecerPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: User;
}

/**
 * `Configuración / Sedes y usuarios` — modal para asignar una nueva
 * contraseña desde Sistemas (Figma 2154:119, tamaño por defecto 560), sin
 * pasar por el flujo de "olvidé mi contraseña" del login.
 */
export function RestablecerPasswordModal({ open, onOpenChange, usuario }: RestablecerPasswordModalProps) {
  const restablecer = useRestablecerPassword();
  const [verPassword, setVerPassword] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RestablecerPasswordInput>({
    resolver: zodResolver(restablecerPasswordSchema),
    defaultValues: DEFAULT_VALUES,
  });

  React.useEffect(() => {
    if (!open) {
      reset(DEFAULT_VALUES);
      setVerPassword(false);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      await restablecer.mutateAsync({ id: usuario.id, input: valores });
      toast.success(`Contraseña restablecida para ${usuario.nombre}`);
      onOpenChange(false);
    } catch (error) {
      const campos = aplicarErroresApi<RestablecerPasswordInput>(error, setError);
      if (campos.length === 0) {
        toast.error('No se pudo restablecer la contraseña', {
          description: mensajeDeError(error, 'Inténtalo de nuevo.'),
        });
      }
    }
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Restablecer contraseña"
        description={`${usuario.nombre} · ${usuario.email}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="form-restablecer-password"
              loading={isSubmitting}
            >
              Restablecer contraseña
            </Button>
          </>
        }
      >
        <form
          id="form-restablecer-password"
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <Input
            label="Contraseña nueva"
            type={verPassword ? 'text' : 'password'}
            autoFocus
            autoComplete="new-password"
            {...register('password')}
            destructive={Boolean(errors.password)}
            hint={errors.password?.message ?? 'Al menos 8 caracteres.'}
            suffix={
              <BotonMostrarPassword visible={verPassword} onToggle={() => setVerPassword((v) => !v)} />
            }
          />
          <Input
            label="Confirmar contraseña nueva"
            type={verPassword ? 'text' : 'password'}
            autoComplete="new-password"
            {...register('confirmacion')}
            destructive={Boolean(errors.confirmacion)}
            hint={errors.confirmacion?.message}
          />
        </form>
      </ModalContent>
    </Modal>
  );
}

/** Botón "ojo" de los campos de contraseña de este modal (mismo patrón que `LoginForm`). */
function BotonMostrarPassword({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      aria-pressed={visible}
      className="grid size-6 place-items-center rounded-xs text-text-secondary transition-colors duration-150 ease-standard hover:text-text-primary focus-visible:outline-none focus-visible:shadow-focus"
    >
      <Icon name={visible ? 'x-mark-circle' : 'eye'} size={16} />
    </button>
  );
}
