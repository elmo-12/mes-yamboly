'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { analyticsApi } from './api';

export function useAnaliticaResumen() {
  return useQuery({ queryKey: queryKeys.analytics.resumen(), queryFn: analyticsApi.resumen });
}

export function usePatrones() {
  return useQuery({ queryKey: queryKeys.analytics.patrones(), queryFn: analyticsApi.patrones });
}

export function usePredicciones() {
  return useQuery({ queryKey: queryKeys.analytics.predicciones(), queryFn: analyticsApi.predicciones });
}

/**
 * Modelo CRISP-DM. Sondea cada 2 s mientras haya un reentrenamiento en curso
 * y se detiene en cuanto la nueva versión queda vigente.
 */
export function useModelo() {
  return useQuery({
    queryKey: queryKeys.analytics.modelo(),
    queryFn: analyticsApi.modelo,
    refetchInterval: (query) =>
      query.state.data?.reentrenamiento?.estado === 'entrenando' ? 2_000 : false,
  });
}

/**
 * Volumen de eventos disponible para entrenar. `estado='insuficiente'` pide al
 * backend la variante de la fase de acumulación (estado E de la spec 08).
 */
export function useEstadoDatos(estado?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.estadoDatos(estado),
    queryFn: () => analyticsApi.estadoDatos(estado),
  });
}

export function useReentrenar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => analyticsApi.reentrenar(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
  });
}

export function useActivarVersionModelo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: string) => analyticsApi.activarVersion(version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
  });
}
