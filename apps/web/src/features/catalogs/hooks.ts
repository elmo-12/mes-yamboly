'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CausaParadaInput, MaquinaInput, Role } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { catalogsApi } from './api';

const CATALOGO_STALE = 5 * 60_000;

export function useSedes() {
  return useQuery({ queryKey: queryKeys.catalogs.sedes(), queryFn: catalogsApi.sedes, staleTime: CATALOGO_STALE });
}

export function useTurnos() {
  return useQuery({ queryKey: queryKeys.catalogs.turnos(), queryFn: catalogsApi.turnos, staleTime: CATALOGO_STALE });
}

export function useLineas(sedeId?: string) {
  return useQuery({
    queryKey: queryKeys.catalogs.lineas(sedeId),
    queryFn: () => catalogsApi.lineas(sedeId),
    staleTime: CATALOGO_STALE,
  });
}

export function useProductos(lineaId?: string) {
  return useQuery({
    queryKey: queryKeys.catalogs.productos(lineaId),
    queryFn: () => catalogsApi.productos(lineaId),
    staleTime: CATALOGO_STALE,
  });
}

export function useUsuarios(sedeId?: string) {
  return useQuery({
    queryKey: queryKeys.catalogs.usuarios(sedeId),
    queryFn: () => catalogsApi.usuarios(sedeId),
    staleTime: CATALOGO_STALE,
  });
}

/** Velocidad estándar editable (Configuración → Productos y velocidades). */
export function useActualizarProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, velocidadEstandar }: { id: string; velocidadEstandar: number }) =>
      catalogsApi.actualizarProducto(id, { velocidadEstandar }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalogs.all }),
  });
}

export function useMaquinas(lineaId?: string) {
  return useQuery({
    queryKey: queryKeys.catalogs.maquinas(lineaId),
    queryFn: () => catalogsApi.maquinas(lineaId),
    staleTime: CATALOGO_STALE,
  });
}

export function useCausasParada(lineaId?: string) {
  return useQuery({
    queryKey: queryKeys.catalogs.causasParada(lineaId),
    queryFn: () => catalogsApi.causasParadaArbol(lineaId),
    staleTime: CATALOGO_STALE,
  });
}

export function useCausasMerma(tipo?: string) {
  return useQuery({
    queryKey: [...queryKeys.catalogs.causasMerma(), tipo ?? 'todas'],
    queryFn: () => catalogsApi.causasMerma(tipo),
    staleTime: CATALOGO_STALE,
  });
}

/** Personas del catálogo, opcionalmente filtradas por rol y línea. */
export function usePersonas(rol?: Role[], lineaId?: string) {
  return useQuery({
    queryKey: [...queryKeys.catalogs.all, 'personas', rol ?? 'todos', lineaId ?? 'todas'] as const,
    queryFn: () => catalogsApi.personas(rol, lineaId),
    staleTime: CATALOGO_STALE,
  });
}

/** Cuadrilla del turno para el paso "Equipo" de la orden. */
export function useColaboradores() {
  return useQuery({
    queryKey: [...queryKeys.catalogs.all, 'colaboradores'] as const,
    queryFn: catalogsApi.colaboradores,
    staleTime: CATALOGO_STALE,
  });
}

export function useCrearMaquina() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MaquinaInput) => catalogsApi.crearMaquina(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalogs.all }),
  });
}

export function useActualizarMaquina() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MaquinaInput> }) =>
      catalogsApi.actualizarMaquina(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalogs.all }),
  });
}

export function useGuardarCausaParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CausaParadaInput }) =>
      id ? catalogsApi.actualizarCausaParada(id, input) : catalogsApi.crearCausaParada(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalogs.all }),
  });
}

export function useEliminarCausaParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogsApi.eliminarCausaParada(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalogs.all }),
  });
}
