'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Icon,
  Input,
  Pagination,
  SectionTitle,
  SelectInline,
  Skeleton,
  TBody,
  THead,
  TH,
  TRow,
  TCell,
  Table,
  toast,
} from '@mes/ui';
import type { EstadoCatalogo, Producto } from '@mes/types';
import { formatNumber } from '@mes/shared';
import {
  useActualizarProducto,
  useLineas,
  useProductos,
  useVelocidadesEstandar,
} from '@/features/catalogs/hooks';
import { EliminarProductoModal } from './EliminarProductoModal';
import { MatrizVelocidades } from './MatrizVelocidades';
import { ProductoDrawer } from './ProductoDrawer';

const POR_PAGINA = 25;
const GUION = '—';
const TODOS = '__todos__';

const ESTADO_OPCIONES = [
  { value: TODOS, label: 'Todos' },
  { value: 'activo', label: 'Activos' },
  { value: 'inactivo', label: 'Inactivos' },
] as const;

type FiltroEstado = EstadoCatalogo | typeof TODOS;

/** Búsqueda insensible a mayúsculas y acentos sobre código, nombre y marca. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Pestaña "Productos y velocidades" (Figma 2165:11984): maestro de productos
 * arriba y, al seleccionar una fila, la matriz producto × 9 líneas debajo.
 *
 * El listado y la matriz comparten una sola consulta de pares
 * (`useVelocidadesEstandar()` sin filtros, 340 filas): la columna «Líneas con
 * velocidad» necesita los pares de todos los productos, así que filtrar por
 * `productoId` en el servidor obligaría a una segunda consulta por cada
 * selección. El filtrado de la tabla es local (201 productos) para que buscar
 * y paginar no dispare peticiones.
 */
export function ProductosVelocidadesTab() {
  const productos = useProductos();
  const velocidades = useVelocidadesEstandar();
  const { data: lineas } = useLineas();
  const actualizar = useActualizarProducto();

  const [busqueda, setBusqueda] = React.useState('');
  const [estado, setEstado] = React.useState<FiltroEstado>(TODOS);
  const [pagina, setPagina] = React.useState(1);
  const [seleccionadoId, setSeleccionadoId] = React.useState<string>();
  const [drawer, setDrawer] = React.useState<{ producto?: Producto }>();
  const [eliminar, setEliminar] = React.useState<Producto>();

  const todos = React.useMemo(() => productos.data?.data ?? [], [productos.data]);
  const pares = React.useMemo(() => velocidades.data?.data ?? [], [velocidades.data]);

  /** Nº de líneas con par activo por producto (columna de la tabla). */
  const lineasPorProducto = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const par of pares) {
      if (par.estado !== 'activo') continue;
      mapa.set(par.productoId, (mapa.get(par.productoId) ?? 0) + 1);
    }
    return mapa;
  }, [pares]);

  const filtro = normalizar(busqueda.trim());
  const filtrados = React.useMemo(
    () =>
      todos.filter((p) => {
        if (estado !== TODOS && p.estado !== estado) return false;
        if (!filtro) return true;
        return [p.codigo, p.nombre, p.descripcionLarga, p.marca ?? '', p.sabor]
          .map(normalizar)
          .some((campo) => campo.includes(filtro));
      }),
    [todos, estado, filtro],
  );

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = filtrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  /* Cualquier cambio de filtro vuelve a la primera página. */
  React.useEffect(() => setPagina(1), [filtro, estado]);

  const seleccionado = todos.find((p) => p.id === seleccionadoId);
  const paresSeleccionado = React.useMemo(
    () => (seleccionado ? pares.filter((par) => par.productoId === seleccionado.id) : []),
    [pares, seleccionado],
  );

  const activar = async (producto: Producto) => {
    try {
      await actualizar.mutateAsync({ id: producto.id, input: { estado: 'activo' } });
      toast.success(`Producto ${producto.codigo} activado`, {
        description: 'Vuelve a estar disponible para velocidades y órdenes.',
      });
    } catch (error) {
      toast.error('No se pudo activar el producto', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      });
    }
  };

  if (productos.error || velocidades.error) {
    return (
      <EmptyState
        variant="error"
        icon={<Icon name="alert-circle" size={40} />}
        title="No se pudo cargar el catálogo de productos"
        description="El servicio de catálogos no respondió. Reintenta en unos segundos."
        action={
          <Button
            variant="secondary"
            icon={<Icon name="arrow-path" />}
            onClick={() => {
              void productos.refetch();
              void velocidades.refetch();
            }}
          >
            Reintentar
          </Button>
        }
      />
    );
  }

  const cargando = productos.isPending || velocidades.isPending;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionTitle
          className="flex-wrap gap-y-3"
          title="Productos y velocidades estándar"
          description={`${formatNumber(todos.length)} productos del maestro · ${formatNumber(
            pares.length,
          )} pares producto × línea`}
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Input
                aria-label="Buscar producto"
                className="w-full sm:w-[260px]"
                wrapperClassName="w-full sm:w-[260px]"
                placeholder="Buscar código, nombre o marca"
                leadingIcon={<Icon name="search" size={16} />}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <SelectInline
                label="Estado"
                options={ESTADO_OPCIONES}
                value={estado}
                onValueChange={(v) => setEstado(v as FiltroEstado)}
              />
              <Button variant="primary" icon={<Icon name="plus" />} onClick={() => setDrawer({})}>
                Nuevo producto
              </Button>
            </div>
          }
        />

        {cargando ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : todos.length === 0 ? (
          <EmptyState
            icon={<Icon name="package" size={40} />}
            title="Sin productos en el maestro"
            description="Crea el primero con «Nuevo producto» y asígnale una velocidad por línea."
          />
        ) : filtrados.length === 0 ? (
          <EmptyState
            variant="no-results"
            icon={<Icon name="search" size={40} />}
            title="Sin productos para esa búsqueda"
            description="Prueba con el código de 7 dígitos, la marca o parte de la descripción."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setBusqueda('');
                  setEstado(TODOS);
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col">
            <Table density="dense">
              <THead>
                <tr>
                  <TH className="w-[110px]">Código</TH>
                  <TH className="min-w-[240px]">Producto</TH>
                  <TH className="w-[120px]">Marca</TH>
                  <TH className="w-[150px]">Presentación</TH>
                  <TH className="w-[130px]">Sabor</TH>
                  <TH numeric className="w-[110px]">
                    Unid/caja
                  </TH>
                  <TH numeric className="w-[100px]">
                    Peso
                  </TH>
                  <TH className="w-[110px]">Estado</TH>
                  <TH numeric className="w-[120px]">
                    Líneas
                  </TH>
                  <TH className="w-[60px]">
                    <span className="sr-only">Acciones</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {visibles.map((p) => {
                  const conVelocidad = lineasPorProducto.get(p.id) ?? 0;
                  const activo = p.id === seleccionadoId;
                  return (
                    <TRow key={p.id} selected={activo}>
                      <TCell className="font-medium tabular">{p.codigo}</TCell>
                      <TCell>
                        <button
                          type="button"
                          aria-pressed={activo}
                          onClick={() => setSeleccionadoId(activo ? undefined : p.id)}
                          className="min-w-0 max-w-full truncate rounded-xs text-left hover:underline focus-visible:shadow-focus focus-visible:outline-none"
                        >
                          {p.nombre}
                        </button>
                      </TCell>
                      <TCell className="text-neutral-text">{p.marca ?? GUION}</TCell>
                      <TCell className="text-neutral-text">{p.presentacion ?? GUION}</TCell>
                      <TCell className="text-neutral-text">{p.sabor || GUION}</TCell>
                      <TCell numeric muted>
                        {formatNumber(p.unidadesPorCaja)}
                      </TCell>
                      <TCell numeric muted>
                        {`${formatNumber(p.pesoKg, 2)} kg`}
                      </TCell>
                      <TCell>
                        <Badge color={p.estado === 'activo' ? 'success' : 'neutral'}>
                          {p.estado === 'activo' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TCell>
                      <TCell numeric muted>
                        {`${formatNumber(conVelocidad)} de ${formatNumber(lineas?.data.length ?? 0)}`}
                      </TCell>
                      <TCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Acciones de ${p.codigo}`}
                            className="grid size-8 place-items-center rounded-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
                          >
                            <Icon name="dots-horizontal" size={18} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => setSeleccionadoId(p.id)}>
                              <Icon name="gauge" size={16} />
                              Ver velocidades
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDrawer({ producto: p })}>
                              <Icon name="edit" size={16} />
                              Editar
                            </DropdownMenuItem>
                            {p.estado === 'inactivo' ? (
                              <DropdownMenuItem onSelect={() => void activar(p)}>
                                <Icon name="play-circle" size={16} />
                                Activar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem danger onSelect={() => setEliminar(p)}>
                                <Icon name="archive" size={16} />
                                Dar de baja
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TCell>
                    </TRow>
                  );
                })}
              </TBody>
            </Table>

            <Pagination
              page={paginaActual}
              pageSize={POR_PAGINA}
              total={filtrados.length}
              actions={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={paginaActual <= 1}
                    onClick={() => setPagina(paginaActual - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={paginaActual >= totalPaginas}
                    onClick={() => setPagina(paginaActual + 1)}
                  >
                    Siguiente
                  </Button>
                </>
              }
            />
          </div>
        )}
      </section>

      {!cargando &&
        (seleccionado ? (
          <MatrizVelocidades
            producto={seleccionado}
            lineas={lineas?.data ?? []}
            pares={paresSeleccionado}
            cargando={velocidades.isFetching && paresSeleccionado.length === 0}
          />
        ) : (
          todos.length > 0 && (
            <EmptyState
              icon={<Icon name="gauge" size={40} />}
              title="Selecciona un producto para ver su matriz de velocidades"
              description="La matriz muestra las 9 líneas agrupadas por tipo de proceso y permite crear el par que falte."
            />
          )
        ))}

      <ProductoDrawer
        open={drawer !== undefined}
        onOpenChange={(abierto) => {
          if (!abierto) setDrawer(undefined);
        }}
        producto={drawer?.producto}
      />

      {eliminar && (
        <EliminarProductoModal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setEliminar(undefined);
          }}
          producto={eliminar}
          onEliminado={() => {
            if (seleccionadoId === eliminar.id) setSeleccionadoId(undefined);
            setEliminar(undefined);
          }}
        />
      )}
    </div>
  );
}
