'use client';

import { Suspense, use } from 'react';
import { OrdenDetallePage } from '@/features/orders/components/OrdenDetallePage';
import { PageSkeleton } from '@/components/PageSkeleton';

/** `/ordenes/[id]` — detalle de OF con pestañas en `?tab=` (Figma 2156:8959). */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<PageSkeleton kpis={4} bloques={2} />}>
      <OrdenDetallePage id={decodeURIComponent(id)} />
    </Suspense>
  );
}
