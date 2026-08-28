import { Suspense } from 'react';
import { OrdenesPage } from '@/features/orders/components/OrdenesPage';
import { PageSkeleton } from '@/components/PageSkeleton';

/** `/ordenes` — listado con filtros en `searchParams` (Figma 2156:4160). */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kpis={4} bloques={1} />}>
      <OrdenesPage />
    </Suspense>
  );
}
