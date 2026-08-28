'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmarDeteccionInput,
  CreateParadaInput,
  FinalizeParadaInput,
  ParadaListQuery,
  UpdateParadaInput,
} from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { downtimesApi } from './api';

function invalidarTodo(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.downtimes.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.realtime.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all });
}

export function useParadas(query: ParadaListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.downtimes.list(query as Record<string, unknown>),
    queryFn: () => downtimesApi.list(query),
  });
}

export function useDetecciones(estado: string | undefined = 'sugerida') {
  return useQuery({
    queryKey: queryKeys.downtimes.detecciones(estado),
    queryFn: () => downtimesApi.detecciones(estado),
    refetchInterval: 30_000,
  });
}

export function useCrearParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateParadaInput) => downtimesApi.crear(input),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useActualizarParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateParadaInput }) =>
      downtimesApi.actualizar(id, input),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useFinalizarParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FinalizeParadaInput }) =>
      downtimesApi.finalizar(id, input),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useConfirmarDeteccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConfirmarDeteccionInput }) =>
      downtimesApi.confirmarDeteccion(id, input),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useDescartarDeteccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => downtimesApi.descartarDeteccion(id),
    onSuccess: () => invalidarTodo(queryClient),
  });
}
