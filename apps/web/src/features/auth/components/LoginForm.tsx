'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Checkbox, Icon, Input, Modal, ModalContent } from '@mes/ui';
import { loginSchema, type LoginInput } from '@mes/types';
import { ApiClientError } from '@/services/api/client';
import { useLogin } from '@/features/auth/hooks';
import { useSession } from '@/hooks/use-session';
import { useHidratado } from '@/hooks/use-hidratacion';

const ERROR_CREDENCIALES = 'Correo o contraseña incorrectos';

/** Mensaje bajo los campos: 401 → credenciales; el resto, error de servicio. */
function mensajeDeError(error: unknown): string {
  if (error instanceof ApiClientError && error.statusCode === 401) return ERROR_CREDENCIALES;
  return 'No se pudo iniciar sesión. Reintenta en unos segundos.';
}

/**
 * `Auth / Login / Default` (Figma 2163:17066) y `Auth / Login / Error`
 * (2163:17234). Columna de 400 con `gap 20`: H2, subtítulo, dos Input lg,
 * fila Checkbox + enlace, Button Primary lg a ancho completo y pie.
 */
export function LoginForm() {
  const router = useRouter();
  const { token } = useSession();
  const hidratado = useHidratado();
  const { mutate, isPending, error, reset } = useLogin();
  const [verPassword, setVerPassword] = React.useState(false);
  const [ayudaAbierta, setAyudaAbierta] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', recordarme: false },
    mode: 'onSubmit',
  });

  /* Sesión ya iniciada (o recién restaurada de localStorage) → al Home. */
  React.useEffect(() => {
    if (hidratado && token) router.replace('/');
  }, [hidratado, token, router]);

  const errorServidor = error ? mensajeDeError(error) : null;
  const emailInvalido = Boolean(errors.email) || Boolean(errorServidor);
  const passwordInvalido = Boolean(errors.password) || Boolean(errorServidor);

  const onSubmit = handleSubmit((valores) => {
    mutate(valores, { onSuccess: () => router.replace('/') });
  });

  return (
    <>
      <h2 className="text-h2 text-text-primary">Iniciar sesión</h2>
      <p className="text-body-sm text-text-secondary">Ingresa con tus credenciales de planta</p>

      <form className="flex w-full flex-col gap-5" onSubmit={onSubmit} noValidate>
        <Input
          {...register('email', { onChange: () => reset() })}
          size="lg"
          label="Correo o DNI"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoFocus
          placeholder="correo@yamboly.pe"
          destructive={emailInvalido}
          hint={errors.email?.message}
        />

        <Input
          {...register('password', { onChange: () => reset() })}
          size="lg"
          label="Contraseña"
          type={verPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••••"
          destructive={passwordInvalido}
          hint={errors.password?.message ?? errorServidor ?? undefined}
          suffix={
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={verPassword}
              className="grid size-6 place-items-center rounded-xs text-text-secondary transition-colors duration-150 ease-standard hover:text-text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              <Icon name={verPassword ? 'x-mark-circle' : 'eye'} size={16} />
            </button>
          }
        />

        <div className="flex w-full items-center gap-2">
          <Checkbox
            label="Recordarme"
            checked={watch('recordarme')}
            onCheckedChange={(v) => setValue('recordarme', v === true)}
          />
          <span className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => setAyudaAbierta(true)}
            className="text-body-md text-primary underline-offset-2 hover:underline focus-visible:rounded-xs focus-visible:outline-none focus-visible:shadow-focus"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={isPending}>
          Ingresar
        </Button>
      </form>

      <p className="text-center text-body-sm text-text-disabled">
        Acceso restringido al personal de Yamboly · Helatony&rsquo;s S.A.C.
      </p>

      <Modal open={ayudaAbierta} onOpenChange={setAyudaAbierta}>
        <ModalContent
          size="sm"
          title="¿Olvidaste tu contraseña?"
          description="El acceso lo administra el área de Sistemas de Helatony's S.A.C."
          footer={
            <Button variant="secondary" onClick={() => setAyudaAbierta(false)}>
              Entendido
            </Button>
          }
        >
          <div className="flex flex-col gap-3 text-body text-neutral-text">
            <p>
              Contacta a Sistemas para restablecerla. Ten a mano tu DNI y la línea en la que
              trabajas; la nueva contraseña se entrega en persona, nunca por mensajería.
            </p>
            <ul className="flex flex-col gap-2">
              <li className="flex items-center gap-2">
                <Icon name="user" size={16} className="shrink-0 text-text-secondary" />
                Oficina de Sistemas · planta Lima, segundo piso
              </li>
              <li className="flex items-center gap-2">
                <Icon name="clock" size={16} className="shrink-0 text-text-secondary" />
                Lunes a sábado, 07:00–18:00
              </li>
            </ul>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
}
