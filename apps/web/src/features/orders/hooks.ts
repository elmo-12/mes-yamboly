'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateOrdenInput, FinalizeOrdenInput, OrdenListQuery, ValidateOrdenInput } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { ordersApi } from './api';

export function useOrdenes(query: OrdenListQuery = {}) {
  return useQuery({ queryKey: queryKeys.orders.list(query), queryFn: () => ordersApi.list(query) });
}

export function useOrdenesResumen() {
  return useQuery({ queryKey: queryKeys.orders.resumen(), queryFn: ordersApi.resumen });
}

export function useOrden(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id ?? ''),
    queryFn: () => ordersApi.detail(id as string),
    enabled: Boolean(id),
  });
}

export function useOrdenParadas(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.paradas(id ?? ''),
    queryFn: () => ordersApi.paradas(id as string),
    enabled: Boolean(id),
  });
}

export function useOrdenMermas(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.mermas(id ?? ''),
    queryFn: () => ordersApi.mermas(id as string),
    enabled: Boolean(id),
  });
}

export function useOrdenVelocidades(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.velocidades(id ?? ''),
    queryFn: () => ordersApi.velocidades(id as string),
    enabled: Boolean(id),
  });
}

export function useOrdenBitacora(id: string | undefined, tipo?: string[]) {
  return useQuery({
    queryKey: [...queryKeys.orders.bitacora(id ?? ''), tipo ?? []],
    queryFn: () => ordersApi.bitacora(id as string, tipo),
    enabled: Boolean(id),
  });
}

export function useCrearOrden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrdenInput) => ordersApi.crear(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.realtime.all });
    },
  });
}

export function useFinalizarOrden(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FinalizeOrdenInput) => ordersApi.finalizar(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.realtime.all });
    },
  });
}

export function useValidarOrden(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ValidateOrdenInput) => ordersApi.validar(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all });
    },
  });
}
