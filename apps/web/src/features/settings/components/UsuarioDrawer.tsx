'use client';

import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Drawer, DrawerContent, Icon, Input, Overline, Select, toast } from '@mes/ui';
import { ROLES, ROLE_LABEL, actualizarUsuarioSchema, crearUsuarioSchema } from '@mes/types';
import type { ActualizarUsuarioInput, CrearUsuarioInput, User } from '@mes/types';
import { useActualizarUsuario, useCrearUsuario, useLineas } from '@/features/catalogs/hooks';
import { ApiClientError } from '@/services/api/client';
import { aplicarErroresApi, mensajeDeError } from '@/services/api/form-errors';

const SIN_LINEA = '__sin_linea__';
const ANCHO_DRAWER = 560;

export interface UsuarioDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Usuario a editar; si se omite, el drawer abre en modo alta. */
  usuario?: User;
}

/**
 * `Configuración / Usuarios` — drawer de alta y edición del
 * directorio. En alta pide contraseña + confirmación; en edición no (para
 * eso está `RestablecerPasswordModal`) pero sí permite editar correo y DNI.
 * Son formularios lo bastante distintos (contratos `CrearUsuarioInput` vs
 * `ActualizarUsuarioInput`) como para vivir en dos subcomponentes en vez de
 * forzar un único `useForm` con tipos genéricos.
 */
export function UsuarioDrawer({ open, onOpenChange, usuario }: UsuarioDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {usuario ? (
        <FormularioEdicion open={open} usuario={usuario} onOpenChange={onOpenChange} />
      ) : (
        <FormularioAlta open={open} onOpenChange={onOpenChange} />
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Alta                                                                */
/* ------------------------------------------------------------------ */

const DEFAULTS_ALTA: CrearUsuarioInput = {
  nombre: '',
  email: '',
  dni: '',
  rol: 'maquinista',
  cargo: '',
  lineaId: null,
  password: '',
  confirmacion: '',
};

function FormularioAlta({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crear = useCrearUsuario();
  const { data: lineas } = useLineas();
  const [verPassword, setVerPassword] = React.useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CrearUsuarioInput>({
    resolver: zodResolver(crearUsuarioSchema),
    defaultValues: DEFAULTS_ALTA,
  });

  React.useEffect(() => {
    if (!open) {
      reset(DEFAULTS_ALTA);
      setVerPassword(false);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      const creado = await crear.mutateAsync(valores);
      toast.success(`Usuario ${creado.nombre} creado`, {
        description: 'Ya puede iniciar sesión con la contraseña asignada.',
      });
      onOpenChange(false);
    } catch (error) {
      const campos = aplicarErroresApi<CrearUsuarioInput>(error, setError);
      if (campos.length > 0) {
        toast.error('Revisa los campos marcados', { description: 'El usuario no se creó.' });
        return;
      }
      /* 409: correo o DNI ya están en uso — el contrato solo trae el valor
         duplicado en `details`, así que el mensaje legible es `error.message`. */
      if (error instanceof ApiClientError && error.statusCode === 409 && error.details) {
        const campo =
          'email' in error.details ? 'email' : 'dni' in error.details ? 'dni' : undefined;
        if (campo) {
          setError(campo, { type: 'server', message: error.message });
          toast.error('No se pudo crear el usuario', { description: error.message });
          return;
        }
      }
      toast.error('No se pudo crear el usuario', {
        description: mensajeDeError(error, 'Revisa los datos del formulario.'),
      });
    }
  });

  return (
    <DrawerContent
      title="Nuevo usuario"
      style={{ width: ANCHO_DRAWER }}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-usuario-alta" loading={isSubmitting}>
            Crear usuario
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Overline>Acceso y datos de la persona</Overline>
        <form id="form-usuario-alta" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Nombre completo"
            placeholder="Ana Quispe"
            autoFocus
            {...register('nombre')}
            destructive={Boolean(errors.nombre)}
            hint={errors.nombre?.message}
          />
          <Input
            label="Correo"
            type="email"
            placeholder="ana.quispe@yamboly.lat"
            {...register('email')}
            destructive={Boolean(errors.email)}
            hint={errors.email?.message}
          />
          <Input
            label="DNI"
            inputMode="numeric"
            maxLength={8}
            placeholder="45871203"
            {...register('dni')}
            destructive={Boolean(errors.dni)}
            hint={errors.dni?.message ?? '8 dígitos.'}
          />
          <Controller
            control={control}
            name="rol"
            render={({ field }) => (
              <Select
                label="Rol"
                placeholder="Selecciona un rol"
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                value={field.value}
                onValueChange={field.onChange}
                destructive={Boolean(errors.rol)}
                hint={errors.rol?.message}
              />
            )}
          />
          <Input
            label="Cargo"
            placeholder="Maquinista de línea"
            {...register('cargo')}
            destructive={Boolean(errors.cargo)}
            hint={errors.cargo?.message}
          />
          <Controller
            control={control}
            name="lineaId"
            render={({ field }) => (
              <Select
                label="Línea asignada"
                placeholder="Selecciona una línea"
                options={[
                  { value: SIN_LINEA, label: 'Sin línea asignada' },
                  ...(lineas?.data ?? []).map((l) => ({
                    value: l.id,
                    label: `${l.codigo} · ${l.nombre}`,
                  })),
                ]}
                value={field.value ?? SIN_LINEA}
                onValueChange={(v) => field.onChange(v === SIN_LINEA ? null : v)}
                hint="Obligatoria para maquinistas; el resto de roles ve todas las líneas."
              />
            )}
          />
          <Input
            label="Contraseña"
            type={verPassword ? 'text' : 'password'}
            autoComplete="new-password"
            {...register('password')}
            destructive={Boolean(errors.password)}
            hint={errors.password?.message ?? 'Al menos 8 caracteres.'}
            suffix={<BotonMostrarPassword visible={verPassword} onToggle={() => setVerPassword((v) => !v)} />}
          />
          <Input
            label="Confirmar contraseña"
            type={verPassword ? 'text' : 'password'}
            autoComplete="new-password"
            {...register('confirmacion')}
            destructive={Boolean(errors.confirmacion)}
            hint={errors.confirmacion?.message}
          />
        </form>
      </div>
    </DrawerContent>
  );
}

/* ------------------------------------------------------------------ */
/* Edición                                                             */
/* ------------------------------------------------------------------ */

function valoresEdicionDesde(usuario: User): ActualizarUsuarioInput {
  return {
    nombre: usuario.nombre,
    email: usuario.email,
    dni: usuario.dni,
    rol: usuario.rol,
    cargo: usuario.cargo,
    lineaId: usuario.lineaId ?? null,
  };
}

function FormularioEdicion({
  open,
  usuario,
  onOpenChange,
}: {
  open: boolean;
  usuario: User;
  onOpenChange: (open: boolean) => void;
}) {
  const actualizar = useActualizarUsuario();
  const { data: lineas } = useLineas();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ActualizarUsuarioInput>({
    resolver: zodResolver(actualizarUsuarioSchema),
    defaultValues: valoresEdicionDesde(usuario),
  });

  /* `usuario` puede cambiar sin desmontar el drawer (mismo componente
     reutilizado para editar filas distintas): se resincroniza al abrir y se
     limpia al cerrar. */
  React.useEffect(() => {
    reset(open ? valoresEdicionDesde(usuario) : DEFAULTS_ALTA_EDICION);
  }, [open, usuario, reset]);

  const onSubmit = handleSubmit(async (valores) => {
    try {
      const actualizado = await actualizar.mutateAsync({ id: usuario.id, input: valores });
      toast.success(`Usuario ${actualizado.nombre} actualizado`);
      onOpenChange(false);
    } catch (error) {
      const campos = aplicarErroresApi<ActualizarUsuarioInput>(error, setError);
      if (campos.length > 0) {
        toast.error('Revisa los campos marcados', { description: 'Los cambios no se guardaron.' });
        return;
      }
      if (error instanceof ApiClientError && error.statusCode === 409 && error.details) {
        const campo =
          'email' in error.details ? 'email' : 'dni' in error.details ? 'dni' : undefined;
        if (campo) {
          setError(campo, { type: 'server', message: error.message });
          toast.error('No se pudo actualizar el usuario', { description: error.message });
          return;
        }
      }
      toast.error('No se pudo actualizar el usuario', {
        description: mensajeDeError(error, 'Revisa los datos del formulario.'),
      });
    }
  });

  return (
    <DrawerContent
      title="Editar usuario"
      style={{ width: ANCHO_DRAWER }}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-usuario-edicion" loading={isSubmitting}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Overline>{usuario.nombre}</Overline>
        <form id="form-usuario-edicion" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Nombre completo"
            autoFocus
            {...register('nombre')}
            destructive={Boolean(errors.nombre)}
            hint={errors.nombre?.message}
          />
          <Input
            label="Correo"
            type="email"
            {...register('email')}
            destructive={Boolean(errors.email)}
            hint={errors.email?.message}
          />
          <Input
            label="DNI"
            inputMode="numeric"
            maxLength={8}
            {...register('dni')}
            destructive={Boolean(errors.dni)}
            hint={errors.dni?.message ?? '8 dígitos.'}
          />
          <Controller
            control={control}
            name="rol"
            render={({ field }) => (
              <Select
                label="Rol"
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                value={field.value ?? usuario.rol}
                onValueChange={field.onChange}
                destructive={Boolean(errors.rol)}
                hint={errors.rol?.message}
              />
            )}
          />
          <Input
            label="Cargo"
            {...register('cargo')}
            destructive={Boolean(errors.cargo)}
            hint={errors.cargo?.message}
          />
          <Controller
            control={control}
            name="lineaId"
            render={({ field }) => (
              <Select
                label="Línea asignada"
                options={[
                  { value: SIN_LINEA, label: 'Sin línea asignada' },
                  ...(lineas?.data ?? []).map((l) => ({
                    value: l.id,
                    label: `${l.codigo} · ${l.nombre}`,
                  })),
                ]}
                value={field.value ?? SIN_LINEA}
                onValueChange={(v) => field.onChange(v === SIN_LINEA ? null : v)}
                hint="Obligatoria para maquinistas; el resto de roles ve todas las líneas."
              />
            )}
          />
        </form>
      </div>
    </DrawerContent>
  );
}

const DEFAULTS_ALTA_EDICION: ActualizarUsuarioInput = {
  nombre: '',
  email: '',
  dni: '',
  cargo: '',
  lineaId: null,
};

/** Botón "ojo" de los campos de contraseña de este drawer (mismo patrón que `LoginForm`). */
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
