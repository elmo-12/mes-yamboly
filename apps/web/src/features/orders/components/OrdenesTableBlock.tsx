'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Icon,
  Input,
  Pagination,
  ProgressBar,
  SectionTitle,
  Skeleton,
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  TSelectCell,
  TSelectHead,
  Table,
} from '@mes/ui';
import { ESTADO_ORDEN_LABEL, TURNO_LABEL } from '@mes/types';
import type { OrdenListItem, Paginated, Periodo } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { AppLink } from '@/components/AppLink';
import { useLineas } from '@/features/catalogs/hooks';
import { ESTADO_ORDEN_COLOR, fechaCorta, oeeToneClass, planPct, planTone } from '../format';
import { PAGE_SIZE, type OrdenesFiltros } from '../use-ordenes-filtros';

/** Columnas ocultables desde el menú "Columnas" (Figma 2156:5670). */
const COLUMNAS = [
  { id: 'fecha', label: 'Fecha' },
  { id: 'linea', label: 'Línea' },
  { id: 'producto', label: 'Producto' },
  { id: 'turno', label: 'Turno' },
  { id: 'plan', label: 'Producido / Plan' },
  { id: 'oee', label: 'OEE %' },
  { id: 'paradas', label: 'Paradas' },
  { id: 'mermas', label: 'Mermas kg' },
  { id: 'estado', label: 'Estado' },
] as const;

type ColumnaId = (typeof COLUMNAS)[number]['id'];

const PERIODO_LABEL: Record<Periodo, string> = {
  hoy: 'Hoy',
  semana: 'Semana',
  mes: 'Mes',
  trimestre: 'Trimestre',
  personalizado: 'Personalizado',
};

const SORT_POR_COLUMNA: Partial<Record<ColumnaId | 'of', string>> = {
  of: 'codigo',
  fecha: 'fecha',
  plan: 'producido',
  oee: 'oee',
};

export interface OrdenesTableBlockProps {
  filtros: OrdenesFiltros;
  onChange: (parcial: Partial<OrdenesFiltros>) => void;
  onClear: () => void;
  data?: Paginated<OrdenListItem>;
  cargando: boolean;
  error: Error | null;
  onReintentar: () => void;
}

export function OrdenesTableBlock({
  filtros,
  onChange,
  onClear,
  data,
  cargando,
  error,
  onReintentar,
}: OrdenesTableBlockProps) {
  const router = useRouter();
  const { data: lineas } = useLineas();
  const [densidad, setDensidad] = React.useState<'standard' | 'compact'>('standard');
  const [ocultas, setOcultas] = React.useState<readonly ColumnaId[]>([]);
  const [seleccion, setSeleccion] = React.useState<readonly string[]>([]);
  const [busqueda, setBusqueda] = React.useState(filtros.search);

  /* La búsqueda de la topbar llega por `?search=`: se refleja en el campo. */
  React.useEffect(() => setBusqueda(filtros.search), [filtros.search]);

  React.useEffect(() => {
    if (busqueda === filtros.search) return;
    const id = window.setTimeout(() => onChange({ search: busqueda }), 300);
    return () => window.clearTimeout(id);
  }, [busqueda, filtros.search, onChange]);

  const visible = React.useCallback((id: ColumnaId) => !ocultas.includes(id), [ocultas]);

  /* `Con paradas` / `Con mermas` no son filtros de la API: se resuelven en
     cliente sobre la página amplia que pide `aQueryApi` (hasta 200 filas). */
  const clienteResumen = filtros.resumen === 'con_paradas' || filtros.resumen === 'con_mermas';
  const { filas, total } = React.useMemo(() => {
    const todas = data?.data ?? [];
    if (!clienteResumen) return { filas: todas, total: data?.meta.total ?? 0 };
    const filtradas = todas.filter((o) =>
      filtros.resumen === 'con_paradas' ? o.paradasCount > 0 : o.mermasKg > 0,
    );
    const desde = (filtros.page - 1) * PAGE_SIZE;
    return { filas: filtradas.slice(desde, desde + PAGE_SIZE), total: filtradas.length };
  }, [clienteResumen, data, filtros.page, filtros.resumen]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sinResultados = !cargando && !error && filas.length === 0;

  /* Resumen de filtros activos para el no-results (Figma 2156:6905). */
  const etiquetasFiltro = [
    PERIODO_LABEL[filtros.periodo],
    ...filtros.linea.map(
      (id) => (lineas?.data ?? []).find((l) => l.id === id)?.codigo ?? id,
    ),
    ...filtros.turno.map((t) => TURNO_LABEL[t]),
    ...filtros.estado.map((e) => ESTADO_ORDEN_LABEL[e]),
    ...(filtros.search ? [`«${filtros.search}»`] : []),
  ];

  const ordenarPor = (columna: ColumnaId | 'of') => {
    const sort = SORT_POR_COLUMNA[columna];
    if (!sort) return;
    onChange({ sort, dir: filtros.sort === sort && filtros.dir === 'desc' ? 'asc' : 'desc' });
  };

  const direccion = (columna: ColumnaId | 'of') =>
    SORT_POR_COLUMNA[columna] === filtros.sort ? filtros.dir : null;

  const todasSeleccionadas = filas.length > 0 && seleccion.length === filas.length;
  const algunaSeleccionada = seleccion.length > 0 && !todasSeleccionadas;

  const descripcion = seleccion.length
    ? `${seleccion.length} seleccionadas · ${formatNumber(total)} en el filtro`
    : sinResultados && etiquetasFiltro.length > 0
      ? `0 resultados · filtros activos: ${etiquetasFiltro.join(' · ')}`
      : `${PAGE_SIZE} por página · ${formatNumber(total)} total`;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        className="flex-wrap gap-y-3"
        title="Detalle de órdenes"
        description={descripcion}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input
              aria-label="Buscar órdenes"
              className="w-full sm:w-[260px]"
              wrapperClassName="w-full sm:w-[260px]"
              placeholder="Buscar OF, lote, producto"
              leadingIcon={<Icon name="search" size={16} />}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <MenuColumnas ocultas={ocultas} onChange={setOcultas} />
            <Button
              variant="secondary"
              icon={<Icon name="layer" />}
              aria-pressed={densidad === 'compact'}
              onClick={() => setDensidad((d) => (d === 'compact' ? 'standard' : 'compact'))}
            >
              Densidad
            </Button>
          </div>
        }
      />

      {error ? (
        <EmptyState
          variant="error"
          icon={<Icon name="alert-circle" size={40} />}
          title="No se pudieron cargar las órdenes"
          description="El repositorio no respondió. Reintenta; si continúa, avisa al área de sistemas."
          action={
            <Button variant="secondary" icon={<Icon name="arrow-path" />} onClick={onReintentar}>
              Reintentar
            </Button>
          }
        />
      ) : sinResultados ? (
        <EmptyState
          variant="no-results"
          icon={<Icon name="search" size={40} />}
          title="Sin órdenes para los filtros seleccionados"
          description="No hay órdenes de fabricación que coincidan con los filtros activos. Ajusta el periodo o limpia los filtros para ver más resultados."
          action={
            <Button variant="secondary" onClick={onClear}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div data-density={densidad}>
          <Table density="dense">
            <THead>
              <tr>
                <TSelectHead>
                  <Checkbox
                    size="sm"
                    aria-label="Seleccionar todas las órdenes de la página"
                    checked={todasSeleccionadas ? true : algunaSeleccionada ? 'indeterminate' : false}
                    onCheckedChange={(v) => setSeleccion(v === true ? filas.map((o) => o.id) : [])}
                  />
                </TSelectHead>
                <TH
                  sortable
                  sortDirection={direccion('of')}
                  onClick={() => ordenarPor('of')}
                  className="w-[108px] px-2"
                >
                  OF
                </TH>
                {visible('fecha') && (
                  <TH
                    sortable
                    sortDirection={direccion('fecha')}
                    onClick={() => ordenarPor('fecha')}
                    className="w-[84px]"
                  >
                    Fecha
                  </TH>
                )}
                {visible('linea') && <TH className="w-[124px]">Línea</TH>}
                {visible('producto') && <TH className="w-[178px]">Producto</TH>}
                {visible('turno') && <TH className="w-[76px]">Turno</TH>}
                {visible('plan') && (
                  <TH
                    sortable
                    sortDirection={direccion('plan')}
                    onClick={() => ordenarPor('plan')}
                    className="w-[144px]"
                  >
                    Producido / Plan
                  </TH>
                )}
                {visible('oee') && (
                  <TH
                    sortable
                    sortDirection={direccion('oee')}
                    onClick={() => ordenarPor('oee')}
                    numeric
                    className="w-[64px]"
                  >
                    OEE
                  </TH>
                )}
                {visible('paradas') && (
                  <TH numeric className="w-[64px] px-2 text-[10px] tracking-normal">
                    Paradas
                  </TH>
                )}
                {visible('mermas') && (
                  <TH numeric className="w-[80px] px-2 text-[10px] tracking-normal">
                    Mermas kg
                  </TH>
                )}
                {visible('estado') && <TH className="w-[104px]">Estado</TH>}
                <TH className="w-[60px]">
                  <span className="sr-only">Acciones</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {cargando
                ? Array.from({ length: 8 }, (_, i) => (
                    <TRow key={`skeleton-${i}`} plain>
                      <TSelectCell>
                        <Skeleton className="size-4 rounded-xs" />
                      </TSelectCell>
                      <TCell colSpan={11}>
                        <Skeleton className="h-4 w-full max-w-[720px]" />
                      </TCell>
                    </TRow>
                  ))
                : filas.map((orden) => (
                    <TRow key={orden.id} selected={seleccion.includes(orden.id)}>
                      <TSelectCell>
                        <Checkbox
                          size="sm"
                          aria-label={`Seleccionar ${orden.codigo}`}
                          checked={seleccion.includes(orden.id)}
                          onCheckedChange={(v) =>
                            setSeleccion((prev) =>
                              v === true
                                ? [...prev, orden.id]
                                : prev.filter((id) => id !== orden.id),
                            )
                          }
                        />
                      </TSelectCell>
                      <TCell className="px-2">
                        <AppLink
                          href={`/ordenes/${orden.codigo}`}
                          className="text-[13px] whitespace-nowrap"
                        >
                          {orden.codigo}
                        </AppLink>
                      </TCell>
                      {visible('fecha') && (
                        <TCell className="whitespace-nowrap text-neutral-text">
                          {fechaCorta(orden.fecha)}
                        </TCell>
                      )}
                      {visible('linea') && (
                        <TCell
                          className="max-w-[124px] truncate text-neutral-text"
                          title={`${orden.lineaCodigo} · ${orden.lineaNombre}`}
                        >{`${orden.lineaCodigo} · ${orden.lineaNombre}`}</TCell>
                      )}
                      {visible('producto') && (
                        <TCell className="max-w-[178px] truncate" title={orden.productoNombre}>
                          {orden.productoNombre}
                        </TCell>
                      )}
                      {visible('turno') && (
                        <TCell className="whitespace-nowrap text-neutral-text">
                          {TURNO_LABEL[orden.turno]}
                        </TCell>
                      )}
                      {visible('plan') && (
                        <TCell>
                          <div className="flex min-w-[92px] flex-col gap-1">
                            <span className="text-caption font-medium tabular text-neutral-text">
                              {`${formatNumber(orden.producido)} / ${formatNumber(orden.planificado)}`}
                            </span>
                            <ProgressBar
                              height={4}
                              value={planPct(orden.producido, orden.planificado)}
                              tone={planTone(orden.producido, orden.planificado)}
                              label={`${orden.producido} de ${orden.planificado} unidades`}
                            />
                          </div>
                        </TCell>
                      )}
                      {visible('oee') && (
                        <TCell numeric className={`font-medium ${oeeToneClass(orden.oee.oee)}`}>
                          {formatNumber(orden.oee.oee, 1)}
                        </TCell>
                      )}
                      {visible('paradas') && (
                        <TCell numeric muted className="px-2">
                          {orden.paradasCount}
                        </TCell>
                      )}
                      {visible('mermas') && (
                        <TCell numeric muted className="px-2">
                          {formatNumber(orden.mermasKg, 1)}
                        </TCell>
                      )}
                      {visible('estado') && (
                        <TCell>
                          <Badge color={ESTADO_ORDEN_COLOR[orden.estado]}>
                            {ESTADO_ORDEN_LABEL[orden.estado]}
                          </Badge>
                        </TCell>
                      )}
                      <TCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Acciones de ${orden.codigo}`}
                            className="grid size-8 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                          >
                            <Icon name="dots-horizontal" size={18} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onSelect={() => router.push(`/ordenes/${orden.codigo}`)}
                            >
                              <Icon name="eye" size={16} />
                              Ver detalle
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={orden.estado !== 'por_validar'}
                              onSelect={() => router.push(`/ordenes/${orden.codigo}?validar=1`)}
                            >
                              <Icon name="check-circle" size={16} />
                              Validar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => router.push(`/ordenes/${orden.codigo}?print=1`)}
                            >
                              <Icon name="printer" size={16} />
                              Imprimir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TCell>
                    </TRow>
                  ))}
            </TBody>
          </Table>

          <Pagination
            page={filtros.page}
            pageSize={PAGE_SIZE}
            total={total}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filtros.page <= 1}
                  onClick={() => onChange({ page: filtros.page - 1 })}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={filtros.page >= totalPaginas}
                  onClick={() => onChange({ page: filtros.page + 1 })}
                >
                  Siguiente
                </Button>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}

/** "Columnas": menú con una marca por columna visible (Figma 2156:5670). */
function MenuColumnas({
  ocultas,
  onChange,
}: {
  ocultas: readonly ColumnaId[];
  onChange: (next: readonly ColumnaId[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" icon={<Icon name="sliders" />}>
          Columnas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
        {COLUMNAS.map((c) => {
          const visible = !ocultas.includes(c.id);
          return (
            <DropdownMenuItem
              key={c.id}
              onSelect={(e) => {
                e.preventDefault();
                onChange(visible ? [...ocultas, c.id] : ocultas.filter((id) => id !== c.id));
              }}
            >
              <span
                aria-hidden
                className={`grid size-4 place-items-center rounded-xs border ${
                  visible
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong bg-background-main'
                }`}
              >
                {visible && <Icon name="check" size={12} />}
              </span>
              {c.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
