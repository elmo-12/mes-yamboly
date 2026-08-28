'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DescriptionList,
  EmptyState,
  Icon,
  Input,
  ListDetailLayout,
  Skeleton,
  cn,
} from '@mes/ui';
import { TIPOS_MERMA, TIPO_MERMA_LABEL } from '@mes/types';
import type { CausaMerma, TipoMermaCodigo } from '@mes/types';
import { useCausasMerma } from '@/features/catalogs/hooks';

/**
 * Pestaña "Causas de merma" — misma vista lista-detalle que las de parada,
 * con el árbol de 2 niveles (tipo de merma → causa MR-01…MR-04).
 *
 * El contrato de API solo expone `GET /causas-merma`: el panel es de solo
 * lectura hasta que exista `PATCH /causas-merma/:id`.
 */
export function CausasMermaTab() {
  const { data, isPending, error, refetch } = useCausasMerma();
  const [busqueda, setBusqueda] = React.useState('');
  const [seleccionadaId, setSeleccionadaId] = React.useState<string>();

  const causas = React.useMemo(() => data?.data ?? [], [data]);

  React.useEffect(() => {
    if (!seleccionadaId && causas[0]) setSeleccionadaId(causas[0].id);
  }, [causas, seleccionadaId]);

  const seleccionada = causas.find((c) => c.id === seleccionadaId);
  const filtro = busqueda.trim().toLowerCase();

  const porTipo = (tipo: TipoMermaCodigo): CausaMerma[] =>
    causas.filter(
      (c) =>
        c.aplicaA.includes(tipo) &&
        (!filtro || `${c.codigo} ${c.nombre}`.toLowerCase().includes(filtro)),
    );

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

  return (
    <ListDetailLayout
      className="flex-col gap-6 xl:flex-row xl:gap-8"
      listClassName="w-full border-r-0 pr-0 xl:w-list-pane xl:border-r xl:pr-8"
      list={
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Buscar causa de merma"
            placeholder="Buscar código o nombre"
            leadingIcon={<Icon name="search" size={16} />}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <p className="text-overline text-text-disabled uppercase">
            {`${causas.length} causas · 3 tipos de merma (MP · EP · PT)`}
          </p>

          {isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {TIPOS_MERMA.map((tipo) => (
                <li key={tipo} className="flex flex-col">
                  <span className="px-2 py-1.5 text-overline text-text-disabled uppercase">
                    {`${tipo} · ${TIPO_MERMA_LABEL[tipo]}`}
                  </span>
                  <ul className="flex flex-col">
                    {porTipo(tipo).map((c) => {
                      const activo = c.id === seleccionadaId;
                      return (
                        <li key={`${tipo}-${c.id}`}>
                          <button
                            type="button"
                            onClick={() => setSeleccionadaId(c.id)}
                            aria-current={activo ? 'true' : undefined}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 pl-6 text-left text-body',
                              activo
                                ? 'bg-primary-subtle font-medium text-info-text'
                                : 'text-neutral-text hover:bg-background-subtle',
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">{`${c.codigo} · ${c.nombre}`}</span>
                            {c.estado === 'inactivo' && <Badge color="neutral">Inactiva</Badge>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
      detail={
        isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-72" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : seleccionada ? (
          <div className="flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="text-h3 text-text-primary">
                  {`${seleccionada.codigo} · ${seleccionada.nombre}`}
                </h2>
                <p className="text-body-sm text-text-secondary">
                  Catálogo de mermas · solo lectura desde el MES
                </p>
              </div>
              <Badge color={seleccionada.estado === 'activo' ? 'success' : 'neutral'}>
                {seleccionada.estado === 'activo' ? 'Activa' : 'Inactiva'}
              </Badge>
            </header>

            <DescriptionList
              labelWidth={260}
              items={[
                { label: 'Código', value: seleccionada.codigo },
                { label: 'Nombre de la causa', value: seleccionada.nombre },
                {
                  label: 'Tipos de merma donde aplica',
                  value: (
                    <span className="flex flex-wrap gap-2">
                      {seleccionada.aplicaA.map((t) => (
                        <Badge key={t} color="informational">
                          {`${t} · ${TIPO_MERMA_LABEL[t]}`}
                        </Badge>
                      ))}
                    </span>
                  ),
                },
                {
                  label: 'Requiere evidencia',
                  value: seleccionada.requiereEvidencia
                    ? 'Sí · foto del producto descartado'
                    : 'No es obligatoria',
                },
                {
                  label: 'Estado',
                  value: seleccionada.estado === 'activo' ? 'Activa' : 'Inactiva',
                },
              ]}
            />

            <p className="text-body-sm text-text-secondary">
              El alta y la baja de causas de merma se coordinan con el área de calidad; el MES las
              consume para clasificar cada registro (RF4).
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<Icon name="package" size={40} />}
            title="Selecciona una causa de merma"
            description="El panel muestra en qué tipos aplica y si exige evidencia fotográfica."
          />
        )
      }
    />
  );
}
