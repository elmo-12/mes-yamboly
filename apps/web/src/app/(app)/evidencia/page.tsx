import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageSkeleton';
import { EvidenciaPage } from '@/features/evidence/components/EvidenciaPage';

/** `Evidencia de tesis` (Figma 2156:5682). La pestaña activa vive en `?tab=`. */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kpis={4} bloques={2} />}>
      <EvidenciaPage />
    </Suspense>
  );
}
