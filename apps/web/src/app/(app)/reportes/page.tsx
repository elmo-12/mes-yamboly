import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageSkeleton';
import { ReportesPage } from '@/features/reports/components/ReportesPage';

/** `(app)/reportes` — RF7 y RF13. El estado de la vista vive en `searchParams`. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kpis={4} bloques={2} />}>
      <ReportesPage />
    </Suspense>
  );
}
