'use client';

import { Badge, EmptyState, Icon, SectionTitle } from '@mes/ui';
import type { ParadaListItem } from '@mes/types';
import { hora } from '../format';
import { FilasSkeleton } from './OrdenParadasTab';

export interface OrdenEvidenciasTabProps {
  paradas: readonly ParadaListItem[];
  cargando: boolean;
}

/**
 * Pestaña Evidencias: archivos adjuntos a los registros de la OF. Se listan
 * como fichas (no `<img>`): las rutas del repositorio de evidencias son
 * internas y se descargan bajo demanda.
 */
export function OrdenEvidenciasTab({ paradas, cargando }: OrdenEvidenciasTabProps) {
  if (cargando) return <FilasSkeleton filas={2} />;

  const adjuntos = paradas.filter((p) => p.evidenciaUrl);

  if (adjuntos.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="camera" size={40} />}
        title="Sin evidencias adjuntas"
        description="Ninguna parada ni merma de esta orden tiene foto o parte de mantenimiento cargado."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Evidencias de la orden"
        description={`${adjuntos.length} archivos adjuntos a paradas y registros de calidad`}
      />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {adjuntos.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-3 rounded-md border border-border bg-background-main p-4"
          >
            <span className="grid h-24 place-items-center rounded-sm bg-background-subtle text-text-disabled">
              <Icon name="camera" size={24} />
            </span>
            <div className="flex flex-col gap-1">
              <span className="truncate text-body-md text-text-primary">
                {nombreArchivo(p.evidenciaUrl as string)}
              </span>
              <span className="text-body-sm text-text-secondary">
                {`Parada ${hora(p.inicio)} · ${p.causaCodigo}`}
              </span>
            </div>
            <Badge color="informational">{p.lineaCodigo}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function nombreArchivo(url: string): string {
  return url.split('/').pop() ?? url;
}
