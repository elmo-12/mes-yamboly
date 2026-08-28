import type { Metadata } from 'next';
import { PublicLayout } from '@/layouts/PublicLayout';

export const metadata: Metadata = {
  title: 'Encuesta de satisfacción · MES Yamboly',
  robots: { index: false, follow: false },
};

/** Encuesta pública (TSP, Anexo 04): fuera del shell y sin sesión. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicLayout headerAside="Encuesta anónima · Postest 2026">{children}</PublicLayout>;
}
