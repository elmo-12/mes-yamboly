import { Suspense } from 'react';
import { ConfiguracionPage } from '@/features/settings/components/ConfiguracionPage';
import { PageSkeleton } from '@/components/PageSkeleton';

/** `/configuracion` — catálogos maestros con pestañas en `?tab=` (Figma 2163:18282). */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kpis={0} bloques={2} />}>
      <ConfiguracionPage />
    </Suspense>
  );
}
