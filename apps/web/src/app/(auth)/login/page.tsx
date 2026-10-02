import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { UsuariosDemo } from '@/features/auth/components/UsuariosDemo';

export const metadata: Metadata = { title: 'Iniciar sesión · MES Yamboly' };

/** `Auth / Login` (Figma 2163:17066 · 2163:17234). El panel de marca lo pone `AuthLayout`. */
/**
 * La lista de cuentas de demostración (con la contraseña común) solo se ve en
 * desarrollo o si el despliegue la habilita a propósito con
 * `NEXT_PUBLIC_MOSTRAR_USUARIOS_DEMO=true`; nunca en un build de producción
 * por defecto (A1).
 */
const MOSTRAR_USUARIOS_DEMO =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_MOSTRAR_USUARIOS_DEMO === 'true';

export default function Page() {
  return (
    <>
      <LoginForm />
      {MOSTRAR_USUARIOS_DEMO && <UsuariosDemo />}
    </>
  );
}
