import { Skeleton } from '@mes/ui';
import { PageSkeleton } from '@/components/PageSkeleton';

/**
 * Esqueleto del shell completo (sidebar 260 + topbar 64 + contenido). Se usa
 * mientras la sesión rehidrata, antes de saber si hay que redirigir a `/login`.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh w-full bg-background-main" aria-busy="true">
      <div className="hidden w-sidebar shrink-0 flex-col gap-1 border-r border-divider px-4 py-5 xl:flex">
        <Skeleton className="mb-4 h-7 w-40" />
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-topbar shrink-0 items-center gap-4 border-b border-divider px-8">
          <Skeleton className="h-ctrl-sm w-80 rounded-md" />
          <div className="flex-1" />
          <Skeleton className="size-8 rounded-pill" />
        </div>
        <div className="flex w-full max-w-app flex-1 flex-col gap-6 px-8 pt-7 pb-10">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}
