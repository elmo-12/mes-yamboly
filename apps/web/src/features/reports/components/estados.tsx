'use client';

import * as React from 'react';
import { EmptyState, Icon, Skeleton } from '@mes/ui';

/** Skeleton de una pestaña de Reportes: fila de KPI + bloques de gráfico. */
export function TabSkeleton({ kpis = 4, bloques = 1 }: { kpis?: number; bloques?: number }) {
  return (
    <div className="flex w-full flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos del periodo…</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: kpis }, (_, i) => (
          <Skeleton key={`k-${i}`} className="h-28 rounded-md" />
        ))}
      </div>
      {Array.from({ length: bloques }, (_, i) => (
        <Skeleton key={`b-${i}`} className="h-[300px] w-full rounded-md" />
      ))}
    </div>
  );
}

/** Error de carga de una pestaña. */
export function TabError({ onReintentar }: { onReintentar?: () => void }) {
  return (
    <EmptyState
      variant="error"
      icon={<Icon name="alert-circle" size={40} />}
      title="No se pudieron cargar los datos"
      description="El servicio de reportes no respondió. Vuelve a intentarlo en unos segundos."
      action={
        onReintentar ? (
          <button
            type="button"
            onClick={onReintentar}
            className="h-ctrl-md rounded-md border border-border px-4 text-body-md text-text-primary hover:bg-background-subtle"
          >
            Reintentar
          </button>
        ) : undefined
      }
    />
  );
}

/** Sin datos en el rango seleccionado. */
export function TabSinDatos({ onLimpiar }: { onLimpiar?: () => void }) {
  return (
    <EmptyState
      variant="no-results"
      icon={<Icon name="search-lg" size={40} />}
      title="Sin datos en el rango seleccionado"
      description="No hay registros para el periodo, la línea o el turno elegidos. Amplía el rango o quita algún filtro."
      action={
        onLimpiar ? (
          <button
            type="button"
            onClick={onLimpiar}
            className="h-ctrl-md rounded-md border border-border px-4 text-body-md text-text-primary hover:bg-background-subtle"
          >
            Limpiar filtros
          </button>
        ) : undefined
      }
    />
  );
}
