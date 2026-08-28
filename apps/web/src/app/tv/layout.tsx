import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Modo TV · MES Yamboly',
  description: 'Tablero de planta en tiempo real',
};

/** Modo TV: fuera del shell, sin sidebar ni topbar. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
