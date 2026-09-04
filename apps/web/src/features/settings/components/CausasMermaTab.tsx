'use client';

import * as React from 'react';
import { Button, EmptyState, Icon, Input, ListDetailLayout, Skeleton } from '@mes/ui';
import { NIVELES_CAUSA_MERMA, causaMermaSchema } from '@mes/types';
import type { CausaMermaInput, CausaMermaNodo } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useCausasMermaArbol, useGuardarCausaMerma, useLineas } from '@/features/catalogs/hooks';
import { aplanarCausas } from '@/features/catalogs/causas';
import { CausaMermaDetalle } from './CausaMermaDetalle';
import { CausasTree } from './CausasTree';
import { NuevaCausaModal, type NivelOption } from './NuevaCausaModal';

const NIVELES: readonly NivelOption[] = [
  { value: 'tipo', label: 'Tipo de producción (nivel 1) · MP-01', nivelPadre: null },
  { value: 'clasificacion', label: 'Clasificación (nivel 2) · MP-01-A', nivelPadre: 'tipo' },
  { value: 'causa', label: 'Causa (nivel 3) · MP-01-01', nivelPadre: 'clasificacion' },
];

const NIVEL_LEGIBLE: Record<string, string> = {
  tipo: 'Tipo de producción',
  clasificacion: 'Clasificación',
  causa: 'Causa',
};

const nuevaCausaSchema = causaMermaSchema.pick({
  codigo: true,
  nombre: true,
  nivel: true,
  parentId: true,
});

/**
 * Pestaña "Causas de merma" — misma vista lista-detalle que las de parada
 * (Figma 2163:18282) sobre el árbol tipo → clasificación → causa.
 */
export function CausasMermaTab() {
  const { data, isPending, error, refetch } = useCausasMermaArbol();
  const { data: lineas } = useLineas();
  const guardar = useGuardarCausaMerma();
  const [busqueda, setBusqueda] = React.useState('');
  const [seleccionadaId, setSeleccionadaId] = React.useState<string>();
  const [nueva, setNueva] = React.useState(false);

  const arbol = React.useMemo<readonly CausaMermaNodo[]>(() => data?.data ?? [], [data]);
  const planas = React.useMemo(() => aplanarCausas(arbol), [arbol]);

  /* Selección por defecto: la primera causa hoja del árbol. */
  React.useEffect(() => {
    if (seleccionadaId || planas.length === 0) return;
    const primera = planas.find((c) => c.nivel === 'causa') ?? planas[0];
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
        title="No se pudo cargar el catálogo de mermas"
        description="El servicio de catálogos no respondió. Reintenta en unos segundos."
        action={
          <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={() => void refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  const sinResultados =
    Boolean(filtro) &&
    !planas.some((c) => `${c.codigo} ${c.nombre}`.toLowerCase().includes(filtro));

  return (
    <>
      <ListDetailLayout
        className="flex-col gap-6 xl:flex-row xl:gap-8"
        listClassName="w-full border-r-0 pr-0 xl:w-list-pane xl:border-r xl:pr-8"
        list={
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Buscar causa de merma"
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
              {`${formatNumber(activas)} causas activas · ${NIVELES_CAUSA_MERMA.length} niveles (tipo · clasificación · causa)`}
            </p>

            {isPending ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : planas.length === 0 ? (
              <EmptyState
                icon={<Icon name="tree-structure" size={32} />}
                title="Sin causas de merma"
                description="Crea la primera con «Nueva causa»."
              />
            ) : sinResultados ? (
              <EmptyState
                variant="no-results"
                icon={<Icon name="search" size={32} />}
                title="Sin coincidencias"
                description={`Ninguna causa contiene «${busqueda.trim()}».`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => setBusqueda('')}>
                    Limpiar búsqueda
                  </Button>
                }
              />
            ) : (
              /* Sin `grupos`: los 5 tipos raíz (MP-01 … MP-05) se pintan como
                 nodos de nivel 0 del propio árbol, así son seleccionables y
                 editables desde el detalle igual que clasificaciones y causas
                 (como encabezado de grupo no lo eran). */
              <CausasTree
                nodos={arbol}
                seleccionadaId={seleccionadaId}
                onSelect={(n) => setSeleccionadaId(n.id)}
                filtro={filtro}
                etiquetaNivel={(nivel) => NIVEL_LEGIBLE[nivel] ?? nivel}
              />
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
            <CausaMermaDetalle
              causa={seleccionada}
              padre={padre}
              lineas={lineas?.data ?? []}
              onEliminada={() => setSeleccionadaId(undefined)}
            />
          ) : (
            <EmptyState
              icon={<Icon name="tree-structure" size={40} />}
              title="Selecciona una causa del árbol"
              description="El panel muestra en qué tipos de merma aplica y qué exige al registrar."
            />
          )
        }
      />

      <NuevaCausaModal
        open={nueva}
        onOpenChange={setNueva}
        schema={nuevaCausaSchema}
        niveles={NIVELES}
        posiblesPadres={planas.filter((c) => c.nivel !== 'causa')}
        titulo="Nueva causa de merma"
        descripcion="El árbol tipo → clasificación → causa mantiene el catálogo uniforme entre líneas (RF4)."
        hintCodigo="Formatos válidos: MP-01, MP-01-A o MP-01-01."
        placeholderCodigo="MP-01-06"
        placeholderNombre="Derrame de mezcla"
        onGuardar={async (valores) => {
          const input: CausaMermaInput = {
            codigo: valores.codigo,
            nombre: valores.nombre,
            nivel: valores.nivel as CausaMermaInput['nivel'],
            parentId: valores.parentId,
            aplicaA: [],
            lineasAplicables: [],
            requiereEvidencia: false,
            requiereComentario: false,
            requiereSolicitud: false,
            estado: 'activo',
          };
          await guardar.mutateAsync({ input });
        }}
      />
    </>
  );
}
