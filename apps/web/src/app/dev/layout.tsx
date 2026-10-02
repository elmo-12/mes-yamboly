import { notFound } from 'next/navigation';

/**
 * `/dev/*` son bancos de pruebas (catálogo de componentes y contratos con
 * mocks): no existen en el build de producción salvo que se habiliten de forma
 * explícita con `NEXT_PUBLIC_HABILITAR_DEV=true` (M8).
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_HABILITAR_DEV !== 'true') {
    notFound();
  }
  return children;
}
