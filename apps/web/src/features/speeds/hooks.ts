'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateVelocidadInput, VelocidadListQuery } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { speedsApi } from './api';

export function useVelocidades(query: VelocidadListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.speeds.list(query as Record<string, unknown>),
    queryFn: () => speedsApi.list(query),
  });
}

export function useCrearVelocidad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVelocidadInput) => speedsApi.crear(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.speeds.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.realtime.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all });
    },
  });
}
