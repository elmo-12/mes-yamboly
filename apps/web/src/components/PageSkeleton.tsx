import { Skeleton } from '@mes/ui';

export interface PageSkeletonProps {
  /** Número de KPI card de la primera fila (4 por fila, gap 16). */
  kpis?: number;
  /** Bloques grandes bajo los KPI (gráficos o tablas). */
  bloques?: number;
}

/**
 * Esqueleto de carga del contenido — `Home / Dashboard / Loading` (Figma
 * 2165:12928): rectángulos `divider` r8 con la geometría real (page header 76,
 * KPI 112, filas de tabla 44).
 */
export function PageSkeleton({ kpis = 4, bloques = 2 }: PageSkeletonProps) {
  return (
    <div className="flex w-full flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      {/* Page header */}
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <Skeleton className="h-ctrl-md w-36" />
          <Skeleton className="h-ctrl-md w-40" />
        </div>
      </div>

      {/* Fila de KPI card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: kpis }, (_, i) => (
          <Skeleton key={`kpi-${i}`} className="h-28 rounded-md" />
        ))}
      </div>

      {/* Bloques mayores */}
      {Array.from({ length: bloques }, (_, i) => (
        <div key={`bloque-${i}`} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
    </div>
  );
}
