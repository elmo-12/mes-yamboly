import { Skeleton } from '@mes/ui';

export interface HomeSkeletonProps {
  /** `jefe` reproduce el frame completo; `maquinista` la variante de una línea. */
  variante?: 'jefe' | 'maquinista';
}

/** Cabecera de página: breadcrumb + H2 + subtítulo + dos acciones. */
function CabeceraSkeleton() {
  return (
    <div className="flex w-full items-end justify-between gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="hidden shrink-0 items-center gap-3 md:flex">
        <Skeleton className="h-ctrl-md w-36" />
        <Skeleton className="h-ctrl-md w-36" />
      </div>
    </div>
  );
}

/** Bloque de título de sección: H4 + descripción + regla. */
function TituloSeccionSkeleton() {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="h-px w-full bg-divider" />
    </div>
  );
}

/** Cabecera 40 + N filas de 44 de una tabla integrada. */
function TablaSkeleton({ filas }: { filas: number }) {
  return (
    <div className="flex w-full flex-col">
      <div className="flex h-10 items-center border-b border-border">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-4 border-b border-divider">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-24 rounded-pill" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="hidden h-4 w-44 sm:block" />
          <Skeleton className="hidden h-4 w-32 lg:block" />
          <Skeleton className="hidden h-4 w-24 lg:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * `Home / Dashboard / Loading` (Figma 2165:12928): los mismos bloques del panel
 * con rectángulos `divider` r8 y la geometría real (KPI 112, filas 44,
 * gráficos 272). También es el `loading.tsx` del shell.
 */
export function HomeSkeleton({ variante = 'jefe' }: HomeSkeletonProps) {
  return (
    <div className="flex w-full flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando el panel del turno…</span>

      <CabeceraSkeleton />

      {variante === 'maquinista' ? (
        <>
          <div className="flex w-full flex-col gap-4 lg:flex-row">
            <Skeleton className="h-[236px] w-full rounded-md lg:w-[548px] lg:shrink-0" />
            <Skeleton className="h-[118px] min-w-0 flex-1 rounded-sm" />
          </div>
          <div className="flex w-full flex-wrap gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-md sm:w-[267px]" />
            ))}
          </div>
          <TituloSeccionSkeleton />
          <TablaSkeleton filas={3} />
        </>
      ) : (
        <>
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-md" />
            ))}
          </div>

          <div className="flex w-full flex-wrap gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-md sm:w-[267px]" />
            ))}
          </div>

          <TituloSeccionSkeleton />
          <div className="flex w-full flex-col gap-4 lg:flex-row">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] min-w-0 flex-1 rounded-sm" />
            ))}
          </div>

          <div className="flex w-full flex-col gap-4 xl:flex-row">
            <div className="flex min-w-0 flex-[720_1_0] basis-0 flex-col gap-3">
              <Skeleton className="h-6 w-64" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-4 w-full rounded-sm" />
              ))}
            </div>
            <div className="flex min-w-0 flex-[380_1_0] basis-0 flex-col gap-3">
              <Skeleton className="h-6 w-52" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-4 w-full rounded-sm" />
              ))}
            </div>
          </div>

          <TituloSeccionSkeleton />
          <TablaSkeleton filas={5} />
        </>
      )}
    </div>
  );
}
