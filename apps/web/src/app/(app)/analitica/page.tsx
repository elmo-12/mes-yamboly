import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageSkeleton';
import { AnaliticaPage } from '@/features/analytics/components/AnaliticaPage';

/** `(app)/analitica` — RF8. Estado de la vista en `searchParams` (`?tab=`, `?estado=`). */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kpis={4} bloques={2} />}>
      <AnaliticaPage />
    </Suspense>
  );
}
