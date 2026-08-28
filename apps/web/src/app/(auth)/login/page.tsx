import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { UsuariosDemo } from '@/features/auth/components/UsuariosDemo';

export const metadata: Metadata = { title: 'Iniciar sesión · MES Yamboly' };

/** `Auth / Login` (Figma 2163:17066 · 2163:17234). El panel de marca lo pone `AuthLayout`. */
export default function Page() {
  return (
    <>
      <LoginForm />
      <UsuariosDemo />
    </>
  );
}
