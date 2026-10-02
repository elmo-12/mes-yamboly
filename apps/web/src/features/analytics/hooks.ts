'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { analyticsApi } from './api';

/** `habilitado = false` evita la petición (p. ej. roles sin permiso: la API respondería 403). */
export function useAnaliticaResumen(habilitado = true) {
  return useQuery({
    queryKey: queryKeys.analytics.resumen(),
    queryFn: analyticsApi.resumen,
    enabled: habilitado,
  });
}

export function usePatrones(habilitado = true) {
  return useQuery({
    queryKey: queryKeys.analytics.patrones(),
    queryFn: analyticsApi.patrones,
    enabled: habilitado,
  });
}

export function usePredicciones(habilitado = true) {
  return useQuery({
    queryKey: queryKeys.analytics.predicciones(),
    queryFn: analyticsApi.predicciones,
    enabled: habilitado,
  });
}

/**
 * Modelo CRISP-DM. Sondea cada 2 s mientras haya un reentrenamiento en curso
 * y se detiene en cuanto la nueva versión queda vigente.
 */
export function useModelo(habilitado = true) {
  return useQuery({
    queryKey: queryKeys.analytics.modelo(),
    queryFn: analyticsApi.modelo,
    enabled: habilitado,
    refetchInterval: (query) =>
      query.state.data?.reentrenamiento?.estado === 'entrenando' ? 2_000 : false,
  });
}

/**
 * Volumen de eventos disponible para entrenar. `estado='insuficiente'` pide al
 * backend la variante de la fase de acumulación (estado E de la spec 08).
 */
export function useEstadoDatos(estado?: string, habilitado = true) {
  return useQuery({
    queryKey: queryKeys.analytics.estadoDatos(estado),
    queryFn: () => analyticsApi.estadoDatos(estado),
    enabled: habilitado,
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
