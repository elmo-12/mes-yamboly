'use client';

import * as React from 'react';
import { Button, EmptyState, Icon, Input, ListDetailLayout, Skeleton } from '@mes/ui';
import { NIVELES_CAUSA, causaParadaSchema } from '@mes/types';
import type { CausaParadaInput, CausaParadaNodo } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { useCausasParada, useGuardarCausaParada, useLineas } from '@/features/catalogs/hooks';
import { aplanarCausas } from '@/features/catalogs/causas';
import { CausaParadaDetalle } from './CausaParadaDetalle';
import { CausasTree, type GrupoCausas } from './CausasTree';
import { NuevaCausaModal, type NivelOption } from './NuevaCausaModal';

/** Agrupación del árbol por clasificación, como en el frame (Figma 2163:18282). */
const GRUPOS = [
  { clasificacion: 'imprevista', label: 'Paradas no planificadas' },
  { clasificacion: 'programada', label: 'Paradas planificadas' },
] as const;

const NIVELES: readonly NivelOption[] = [
  { value: 'tipo', label: 'Tipo (nivel 1) · PN-02', nivelPadre: null },
  { value: 'general', label: 'Categoría general (nivel 2) · PN-02-A', nivelPadre: 'tipo' },
  { value: 'especifica', label: 'Causa específica (nivel 3) · PN-02-01', nivelPadre: 'general' },
];

const NIVEL_LEGIBLE: Record<string, string> = {
  tipo: 'Tipo',
  general: 'Categoría general',
  especifica: 'Causa específica',
};

const nuevaCausaSchema = causaParadaSchema.pick({
  codigo: true,
  nombre: true,
  nivel: true,
  parentId: true,
});

/** Pestaña "Causas de parada" — lista-detalle (Figma 2163:18282). */
export function CausasParadaTab() {
  const { data, isPending, error, refetch } = useCausasParada();
  const { data: lineas } = useLineas();
  const guardar = useGuardarCausaParada();
  const [busqueda, setBusqueda] = React.useState('');
  const [seleccionadaId, setSeleccionadaId] = React.useState<string>();
  const [nueva, setNueva] = React.useState(false);

  const arbol = React.useMemo<readonly CausaParadaNodo[]>(() => data?.data ?? [], [data]);
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

  const grupos = React.useCallback(
    (nodos: readonly CausaParadaNodo[]): readonly GrupoCausas<CausaParadaNodo>[] =>
      GRUPOS.map((g) => ({
        id: g.clasificacion,
        label: g.label,
        nodos: nodos.filter((n) => n.clasificacion === g.clasificacion),
      })),
    [],
  );

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
              {`${formatNumber(activas)} causas activas · ${NIVELES_CAUSA.length} niveles de codificación (TT-GG-EE)`}
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
                title="Sin causas de parada"
                description="Crea la primera con «Nueva causa»."
              />
            ) : (
              <CausasTree
                nodos={arbol}
                grupos={grupos}
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
            <CausaParadaDetalle
              causa={seleccionada}
              padre={padre}
              lineas={lineas?.data ?? []}
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
        schema={nuevaCausaSchema}
        niveles={NIVELES}
        posiblesPadres={planas.filter((c) => c.nivel !== 'especifica')}
        titulo="Nueva causa de parada"
        descripcion="La codificación TT-GG-EE mantiene el catálogo uniforme entre líneas (RF11)."
        hintCodigo="Formatos válidos: PN-02, PN-02-A o PN-02-01."
        placeholderCodigo="PN-02-05"
        placeholderNombre="Obstrucción de boquilla"
        onGuardar={async (valores) => {
          const input: CausaParadaInput = {
            codigo: valores.codigo,
            nombre: valores.nombre,
            nivel: valores.nivel as CausaParadaInput['nivel'],
            parentId: valores.parentId,
            clasificacion: 'imprevista',
            afectaOee: true,
            requiereEvidencia: false,
            requiereSolicitud: false,
            tiempoEstandarMin: 0,
            lineasAplicables: [],
            estado: 'activo',
            codigoLegado: null,
          };
          await guardar.mutateAsync({ input });
        }}
      />
    </>
  );
}
