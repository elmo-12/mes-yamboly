'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateMermaInput, MermaListQuery, UpdateMermaInput } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { scrapApi } from './api';

function invalidar(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.scrap.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all });
}

export function useMermas(query: MermaListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.scrap.list(query as Record<string, unknown>),
    queryFn: () => scrapApi.list(query),
  });
}

export function useCrearMerma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMermaInput) => scrapApi.crear(input),
    onSuccess: () => invalidar(queryClient),
  });
}

export function useActualizarMerma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMermaInput }) => scrapApi.actualizar(id, input),
    onSuccess: () => invalidar(queryClient),
  });
}
