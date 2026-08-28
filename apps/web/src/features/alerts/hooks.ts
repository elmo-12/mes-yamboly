'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AlertaListQuery,
  AtenderAlertaInput,
  ConfirmarEventoInput,
  ConfirmarLoteInput,
  DescartarAlertaInput,
  UmbralesInput,
} from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { alertsApi } from './api';

/** Atender/confirmar mueve el KPI EP: se invalidan alertas, analítica y evidencia. */
function invalidarAlertas(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.realtime.all });
}

export function useAlertas(query: AlertaListQuery = {}) {
  return useQuery({ queryKey: queryKeys.alerts.list(query), queryFn: () => alertsApi.list(query) });
}

export function useAlertasResumen() {
  return useQuery({ queryKey: queryKeys.alerts.resumen(), queryFn: alertsApi.resumen });
}

export function useAlertasRecientes(limit = 3) {
  return useQuery({
    queryKey: [...queryKeys.alerts.recientes(), limit],
    queryFn: () => alertsApi.recientes(limit),
  });
}

export function useAlerta(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.alerts.detail(id ?? ''),
    queryFn: () => alertsApi.detail(id as string),
    enabled: Boolean(id),
  });
}

export function useAtenderAlerta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AtenderAlertaInput }) => alertsApi.atender(id, input),
    onSuccess: () => invalidarAlertas(queryClient),
  });
}

export function useDescartarAlerta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DescartarAlertaInput }) => alertsApi.descartar(id, input),
    onSuccess: () => invalidarAlertas(queryClient),
  });
}

export function useConfirmarEvento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConfirmarEventoInput }) => alertsApi.confirmar(id, input),
    onSuccess: () => invalidarAlertas(queryClient),
  });
}

export function useConfirmarLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmarLoteInput) => alertsApi.confirmarLote(input),
    onSuccess: () => invalidarAlertas(queryClient),
  });
}

export function useUmbrales() {
  return useQuery({ queryKey: queryKeys.alerts.umbrales(), queryFn: alertsApi.umbrales });
}

export function useGuardarUmbrales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UmbralesInput) => alertsApi.guardarUmbrales(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all }),
  });
}
