'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ActualizarUsuarioInput,
  CausaMermaInput,
  CausaParadaInput,
  CrearUsuarioInput,
  LineaInput,
  ProductoInput,
  RestablecerPasswordInput,
  Role,
  UpdateProductoInput,
  UpdateVelocidadEstandarInput,
  VelocidadEstandarInput,
} from '@mes/types';
import { queryKeys, type CatalogoFiltros } from '@/services/api/query-keys';
import {
  catalogsApi,
  type CausaMermaFiltros,
  type CausaParadaFiltros,
  type LineaFiltros,
  type ProductoFiltros,
  type SaborFiltros,
  type UsuarioFiltros,
  type VelocidadEstandarFiltros,
} from './api';

const CATALOGO_STALE = 5 * 60_000;

/**
 * Varias vistas ya llamaban a estos hooks con el id suelto
 * (`useProductos(lineaId)`); se admite tanto el atajo como el objeto de
 * filtros para no obligar a tocar las 20 vistas que los consumen.
 */
function normalizar<T extends object>(filtros: string | T | undefined, clave: keyof T): T {
  if (filtros === undefined) return {} as T;
  return typeof filtros === 'string' ? ({ [clave]: filtros } as T) : filtros;
}

/** Los filtros forman parte de la clave de caché; `undefined` no aporta nada. */
function clave(filtros: object): CatalogoFiltros {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => valor !== undefined && valor !== ''),
  ) as CatalogoFiltros;
}

/* ------------------------------------------------------------------ */
/* Invalidación                                                        */
/* ------------------------------------------------------------------ */

function invalidar(queryClient: QueryClient, ...claves: readonly (readonly unknown[])[]): void {
  for (const queryKey of claves) void queryClient.invalidateQueries({ queryKey });
}

/* ------------------------------------------------------------------ */
/* Turnos                                                              */
/* ------------------------------------------------------------------ */

export function useTurnos() {
  return useQuery({
    queryKey: queryKeys.catalogs.turnos(),
    queryFn: catalogsApi.turnos,
    staleTime: CATALOGO_STALE,
  });
}

/* ------------------------------------------------------------------ */
/* Sabores y líneas                                                    */
/* ------------------------------------------------------------------ */

export function useSabores(filtros: SaborFiltros = {}) {
  return useQuery({
    queryKey: queryKeys.catalogs.saboresList(clave(filtros)),
    queryFn: () => catalogsApi.sabores(filtros),
    staleTime: CATALOGO_STALE,
  });
}

export function useLineas(filtros?: string | LineaFiltros) {
  const f = normalizar<LineaFiltros>(filtros, 'tipoProceso');
  return useQuery({
    queryKey: queryKeys.catalogs.lineasList(clave(f)),
    queryFn: () => catalogsApi.lineas(f),
    staleTime: CATALOGO_STALE,
  });
}

/**
 * Mantenedor de líneas (Configuración → Líneas). La línea **es** la máquina
 * física: no existe un nivel de equipo por debajo.
 */
export function useCrearLinea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LineaInput) => catalogsApi.crearLinea(input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.lineas()),
  });
}

export function useActualizarLinea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<LineaInput> }) =>
      catalogsApi.actualizarLinea(id, input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.lineas()),
  });
}

export function useBajaLinea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogsApi.bajaLinea(id),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.lineas()),
  });
}

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

export function useProductos(filtros?: string | ProductoFiltros) {
  const f = normalizar<ProductoFiltros>(filtros, 'lineaId');
  return useQuery({
    queryKey: queryKeys.catalogs.productosList(clave(f)),
    queryFn: () => catalogsApi.productos(f),
    staleTime: CATALOGO_STALE,
  });
}

export function useCrearProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductoInput) => catalogsApi.crearProducto(input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.productos()),
  });
}

export function useActualizarProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductoInput }) =>
      catalogsApi.actualizarProducto(id, input),
    /* La matriz de velocidades muestra código y nombre del producto. */
    onSuccess: () =>
      invalidar(queryClient, queryKeys.catalogs.productos(), queryKeys.catalogs.velocidades()),
  });
}

export function useBajaProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogsApi.bajaProducto(id),
    /* Un producto inactivo deja de ofrecer sus pares producto × línea. */
    onSuccess: () =>
      invalidar(queryClient, queryKeys.catalogs.productos(), queryKeys.catalogs.velocidades()),
  });
}

/* ------------------------------------------------------------------ */
/* Velocidades estándar (par producto × línea)                         */
/* ------------------------------------------------------------------ */

/**
 * @param opciones `enabled: false` evita traer la matriz completa (340 pares)
 *   desde pantallas que sólo necesitan el par de un producto × línea concreto
 *   (p. ej. `IniciarOrdenWizard`, montado siempre en `/tiempo-real`).
 */
export function useVelocidadesEstandar(
  filtros: VelocidadEstandarFiltros = {},
  opciones: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.catalogs.velocidadesList(clave(filtros)),
    queryFn: () => catalogsApi.velocidadesEstandar(filtros),
    staleTime: CATALOGO_STALE,
    enabled: opciones.enabled ?? true,
  });
}

/**
 * Alta y baja del par mueven tres catálogos: las velocidades, el filtro
 * `productos?lineaId=` (que sólo devuelve productos con par activo) y la
 * capacidad nominal de la línea (`capacidadUnidadesMin`).
 */
function invalidarVelocidades(queryClient: QueryClient): void {
  invalidar(
    queryClient,
    queryKeys.catalogs.velocidades(),
    queryKeys.catalogs.productos(),
    queryKeys.catalogs.lineas(),
  );
}

export function useCrearVelocidadEstandar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VelocidadEstandarInput) => catalogsApi.crearVelocidadEstandar(input),
    onSuccess: () => invalidarVelocidades(queryClient),
  });
}

export function useActualizarVelocidadEstandar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateVelocidadEstandarInput }) =>
      catalogsApi.actualizarVelocidadEstandar(id, input),
    onSuccess: () => invalidarVelocidades(queryClient),
  });
}

export function useBajaVelocidadEstandar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogsApi.bajaVelocidadEstandar(id),
    onSuccess: () => invalidarVelocidades(queryClient),
  });
}

/* ------------------------------------------------------------------ */
/* Causas de parada                                                    */
/* ------------------------------------------------------------------ */

export function useCausasParada(filtros?: string | CausaParadaFiltros) {
  const f = normalizar<CausaParadaFiltros>(filtros, 'lineaId');
  return useQuery({
    queryKey: queryKeys.catalogs.causasParadaArbol(clave(f)),
    queryFn: () => catalogsApi.causasParadaArbol(f),
    staleTime: CATALOGO_STALE,
  });
}

export function useCausasParadaPlano(filtros: CausaParadaFiltros = {}) {
  return useQuery({
    queryKey: queryKeys.catalogs.causasParadaPlano(clave(filtros)),
    queryFn: () => catalogsApi.causasParadaPlano(filtros),
    staleTime: CATALOGO_STALE,
  });
}

/** Alta (`sin id`) o edición (`con id`) de una causa de parada. */
export function useGuardarCausaParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CausaParadaInput }) =>
      id ? catalogsApi.actualizarCausaParada(id, input) : catalogsApi.crearCausaParada(input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.causasParada()),
  });
}

export function useBajaCausaParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogsApi.bajaCausaParada(id),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.causasParada()),
  });
}

/* ------------------------------------------------------------------ */
/* Causas de merma                                                     */
/* ------------------------------------------------------------------ */

/** Árbol Tipo → Clasificación → Causa (`GET /causas-merma?formato=arbol`). */
export function useCausasMermaArbol(filtros: CausaMermaFiltros = {}) {
  return useQuery({
    queryKey: queryKeys.catalogs.causasMermaArbol(clave(filtros)),
    queryFn: () => catalogsApi.causasMermaArbol(filtros),
    staleTime: CATALOGO_STALE,
  });
}

/** Listado plano de las 3 niveles (`GET /causas-merma?formato=plano`). */
export function useCausasMerma(filtros?: string | CausaMermaFiltros) {
  const f = normalizar<CausaMermaFiltros>(filtros, 'tipo');
  return useQuery({
    queryKey: queryKeys.catalogs.causasMermaPlano(clave(f)),
    queryFn: () => catalogsApi.causasMermaPlano(f),
    staleTime: CATALOGO_STALE,
  });
}

/** Alta (`sin id`) o edición (`con id`) de una causa de merma. */
export function useGuardarCausaMerma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CausaMermaInput }) =>
      id ? catalogsApi.actualizarCausaMerma(id, input) : catalogsApi.crearCausaMerma(input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.causasMerma()),
  });
}

export function useBajaCausaMerma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogsApi.bajaCausaMerma(id),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.causasMerma()),
  });
}

/* ------------------------------------------------------------------ */
/* Usuarios                                                            */
/* ------------------------------------------------------------------ */

export function useUsuarios(filtros?: string | UsuarioFiltros) {
  const f = normalizar<UsuarioFiltros>(filtros, 'lineaId');
  return useQuery({
    queryKey: queryKeys.catalogs.usuariosList(clave(f)),
    queryFn: () => catalogsApi.usuarios(f),
    staleTime: CATALOGO_STALE,
  });
}

export function useCrearUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearUsuarioInput) => catalogsApi.crearUsuario(input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.usuarios()),
  });
}

export function useActualizarUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ActualizarUsuarioInput }) =>
      catalogsApi.actualizarUsuario(id, input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.usuarios()),
  });
}

/** Activar/desactivar: un usuario inactivo no puede iniciar sesión. */
export function useCambiarEstadoUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      catalogsApi.cambiarEstadoUsuario(id, activo),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.usuarios()),
  });
}

export function useRestablecerPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RestablecerPasswordInput }) =>
      catalogsApi.restablecerPassword(id, input),
    onSuccess: () => invalidar(queryClient, queryKeys.catalogs.usuarios()),
  });
}

/** Personas del catálogo, opcionalmente filtradas por rol y línea. */
export function usePersonas(rol?: Role[], lineaId?: string) {
  return useQuery({
    queryKey: queryKeys.catalogs.personas(clave({ rol, lineaId })),
    queryFn: () => catalogsApi.personas(rol, lineaId),
    staleTime: CATALOGO_STALE,
  });
}

/** Cuadrilla del turno para el paso "Equipo" de la orden. */
export function useColaboradores() {
  return useQuery({
    queryKey: queryKeys.catalogs.colaboradores(),
    queryFn: catalogsApi.colaboradores,
    staleTime: CATALOGO_STALE,
  });
}
