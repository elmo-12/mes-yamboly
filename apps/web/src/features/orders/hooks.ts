'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateOrdenInput,
  FinalizeOrdenInput,
  OrdenListQuery,
  OrdenSapQuery,
  ValidateOrdenInput,
} from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { ordenesSapApi, ordersApi } from './api';

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
      /* La fila SAP elegida queda consumida: deja de ser seleccionable. */
      void queryClient.invalidateQueries({ queryKey: queryKeys.ordenesSap.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.realtime.all });
    },
  });
}

export function useFinalizarOrden(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FinalizeOrdenInput) => ordersApi.finalizar(id, input),
    /* También tras un 409 (otra persona ya la cerró): la vista debe reflejarlo. */
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.realtime.all });
    },
  });
}

export function useValidarOrden(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ValidateOrdenInput) => ordersApi.validar(id, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all });
    },
  });
}

/**
 * Órdenes SAP pendientes de una línea. El selector pide la línea completa y
 * filtra el buscador en cliente, como el wizard legado (son pocas filas y así
 * no parpadea la lista al teclear); `q` queda disponible para otros usos.
 */
export function useOrdenesSap(query: OrdenSapQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.ordenesSap.list(query),
    queryFn: () => ordenesSapApi.list(query),
    enabled: options.enabled ?? true,
  });
}

export function useSincronizarOrdenesSap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ordenesSapApi.sincronizar(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ordenesSap.all });
    },
  });
}
