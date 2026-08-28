'use client';

import * as React from 'react';
import {
  Button,
  EmptyState,
  Icon,
  Input,
  ListDetailLayout,
  Skeleton,
} from '@mes/ui';
import type { CausaParadaNodo } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useCausasParada, useLineas } from '@/features/catalogs/hooks';
import { aplanarCausas } from '@/features/catalogs/causas';
import { CausaParadaDetalle } from './CausaParadaDetalle';
import { CausasTree } from './CausasTree';
import { NuevaCausaModal } from './NuevaCausaModal';

/** Agrupación del árbol por clasificación, como en el frame (Figma 2163:18282). */
const GRUPOS = [
  { clasificacion: 'imprevista', label: 'Paradas no planificadas' },
  { clasificacion: 'programada', label: 'Paradas planificadas' },
] as const;

/** Pestaña "Causas de parada" — lista-detalle (Figma 2163:18282). */
export function CausasParadaTab() {
  const { data, isPending, error, refetch } = useCausasParada();
  const { data: lineas } = useLineas();
  const [busqueda, setBusqueda] = React.useState('');
  const [seleccionadaId, setSeleccionadaId] = React.useState<string>();
  const [nueva, setNueva] = React.useState(false);

  const arbol = React.useMemo(() => data?.data ?? [], [data]);
  const planas = React.useMemo(() => aplanarCausas(arbol), [arbol]);

  /* Selección por defecto: la primera causa específica del árbol. */
  React.useEffect(() => {
    if (seleccionadaId || planas.length === 0) return;
    const primera = planas.find((c) => c.nivel === 'especifica') ?? planas[0];
    if (primera) setSeleccionadaId(primera.id);
  }, [planas, seleccionadaId]);

  const seleccionada = planas.find((c) => c.id === seleccionadaId);
  const padre = seleccionada?.parentId
    ? planas.find((c) => c.id === seleccionada.parentId)
    : undefined;

  const activas = planas.filter((c) => c.estado === 'activo').length;
  const filtro = busqueda.trim().toLowerCase();

  if (error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el catálogo de causas"
        description="El servicio de catálogos no respondió. Reintenta en unos segundos."
        action={
          <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={() => void refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListDetailLayout
        className="flex-col gap-6 xl:flex-row xl:gap-8"
        listClassName="w-full border-r-0 pr-0 xl:w-list-pane xl:border-r xl:pr-8"
        list={
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Buscar causa de parada"
                placeholder="Buscar código o nombre"
                leadingIcon={<Icon name="search" size={16} />}
                wrapperClassName="min-w-0 flex-1"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="plus" />}
                className="shrink-0"
                onClick={() => setNueva(true)}
              >
                Nueva causa
              </Button>
            </div>

            <p className="text-overline text-text-disabled uppercase">
              {`${formatNumber(activas)} causas activas · 3 niveles de codificación (TT-GG-EE)`}
            </p>

            {isPending ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {GRUPOS.map((g) => {
                  const nodos = (arbol as readonly CausaParadaNodo[]).filter(
                    (n) => n.clasificacion === g.clasificacion,
                  );
                  if (nodos.length === 0) return null;
                  return (
                    <div key={g.clasificacion} className="flex flex-col">
                      <span className="px-2 py-1.5 text-overline text-text-disabled uppercase">
                        {g.label}
                      </span>
                      <CausasTree
                        nodos={nodos}
                        seleccionadaId={seleccionadaId}
                        onSelect={(n) => setSeleccionadaId(n.id)}
                        filtro={filtro}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        }
        detail={
          isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-7 w-80" />
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : seleccionada ? (
            <CausaParadaDetalle
              causa={seleccionada}
              padre={padre}
              lineas={(lineas?.data ?? []).filter((l) => l.id !== 'LIN-PT')}
              onEliminada={() => setSeleccionadaId(undefined)}
            />
          ) : (
            <EmptyState
              icon={<Icon name="tree-structure" size={40} />}
              title="Selecciona una causa del árbol"
              description="El panel muestra su codificación, si afecta al OEE y en qué líneas aplica."
            />
          )
        }
      />

      <NuevaCausaModal
        open={nueva}
        onOpenChange={setNueva}
        posiblesPadres={planas.filter((c) => c.nivel !== 'especifica')}
      />
    </>
  );
}
