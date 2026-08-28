import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageSkeleton';
import { AlertasPage } from '@/features/alerts/components/AlertasPage';

/** `Alertas / Bandeja` (Figma 2156:5417). El estado vive en la query (`?id=`, filtros, página). */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kpis={4} bloques={1} />}>
      <AlertasPage />
    </Suspense>
  );
}
