'use client';

import { Badge, EmptyState, Icon, SectionTitle } from '@mes/ui';
import type { MermaListItem, OrdenListItem, ParadaListItem } from '@mes/types';
import { hora } from '../format';
import { EvidenciaFoto } from './EvidenciaFoto';
import { FilasSkeleton } from './OrdenParadasTab';

export interface OrdenEvidenciasTabProps {
  orden: Pick<OrdenListItem, 'evidenciaUrl' | 'fin' | 'lineaCodigo'>;
  paradas: readonly ParadaListItem[];
  mermas?: readonly MermaListItem[];
  cargando: boolean;
}

interface Adjunto {
  id: string;
  url: string;
  origen: string;
  badge: string;
}

/**
 * Pestaña Evidencias: archivos adjuntos a la OF —la foto de la etiqueta que se
 * sube al finalizarla y las fotos de paradas y mermas—. Se listan como fichas
 * (no `<img>`): las rutas del repositorio de evidencias van autenticadas y se
 * abren bajo demanda con {@link EvidenciaFoto}.
 */
export function OrdenEvidenciasTab({ orden, paradas, mermas = [], cargando }: OrdenEvidenciasTabProps) {
  if (cargando) return <FilasSkeleton filas={2} />;

  const adjuntos: Adjunto[] = [
    ...(orden.evidenciaUrl
      ? [
          {
            id: 'etiqueta',
            url: orden.evidenciaUrl,
            origen: `Etiqueta · cierre ${orden.fin ? hora(orden.fin) : ''}`.trim(),
            badge: 'Etiqueta',
          },
        ]
      : []),
    ...paradas
      .filter((p) => p.evidenciaUrl)
      .map((p) => ({
        id: p.id,
        url: p.evidenciaUrl as string,
        origen: `Parada ${hora(p.inicio)} · ${p.causaCodigo}`,
        badge: 'Parada',
      })),
    ...mermas
      .filter((m) => m.evidenciaUrl)
      .map((m) => ({
        id: m.id,
        url: m.evidenciaUrl as string,
        origen: `Merma ${hora(m.registradaEn)} · ${m.causaCodigo}`,
        badge: 'Merma',
      })),
  ];

  if (adjuntos.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="camera" size={40} />}
        title="Sin evidencias adjuntas"
        description="La orden no tiene foto de etiqueta y ninguna parada ni merma tiene foto o parte de mantenimiento cargado."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title="Evidencias de la orden"
        description={`${adjuntos.length} archivos adjuntos a la etiqueta, paradas y mermas`}
      />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {adjuntos.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-3 rounded-md border border-border bg-background-main p-4"
          >
            <span className="grid h-24 place-items-center rounded-sm bg-background-subtle text-text-disabled">
              <Icon name="camera" size={24} />
            </span>
            <div className="flex flex-col gap-1">
              <span className="truncate text-body-md text-text-primary">{nombreArchivo(a.url)}</span>
              <span className="text-body-sm text-text-secondary">{a.origen}</span>
              {/* Sólo rutas del repositorio de evidencias: nada de URLs arbitrarias. */}
              {a.url.startsWith('/api/v1/evidencias/') && <EvidenciaFoto url={a.url} />}
            </div>
            <div className="flex gap-2">
              <Badge color="informational">{a.badge}</Badge>
              <Badge color="neutral">{orden.lineaCodigo}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function nombreArchivo(url: string): string {
  return url.split('/').pop() ?? url;
}
