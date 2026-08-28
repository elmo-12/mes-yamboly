'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { realtimeApi } from './api';
import type { TiempoRealFiltros } from './api';

/** Cadencia del tablero de planta (spec 03.A: "lectura de sensores cada 5 s"). */
export const REFRESCO_TIEMPO_REAL_MS = 5_000;

/** El tablero se refresca solo: 10 s de intervalo y 5 s de frescura. */
export function useTiempoReal(filtros: TiempoRealFiltros = {}) {
  return useQuery({
    queryKey: queryKeys.realtime.lineas(filtros as Record<string, unknown>),
    queryFn: () => realtimeApi.lineas(filtros),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

/**
 * Tablero `/tiempo-real` (Figma 2156:3936): mismos datos que `useTiempoReal`
 * pero con la cadencia de 5 s que anuncia la propia pantalla.
 */
export function useLineasTiempoReal(filtros: TiempoRealFiltros = {}) {
  return useQuery({
    queryKey: queryKeys.realtime.lineas(filtros as Record<string, unknown>),
    queryFn: () => realtimeApi.lineas(filtros),
    refetchInterval: REFRESCO_TIEMPO_REAL_MS,
    staleTime: REFRESCO_TIEMPO_REAL_MS / 2,
  });
}

export function useLineaTimeline(lineaId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.realtime.timeline(lineaId ?? ''),
    queryFn: () => realtimeApi.timeline(lineaId as string),
    enabled: Boolean(lineaId),
  });
}

/** Modo TV (Figma 2163:8523): solo lectura, refresco cada 5 s. */
export function useModoTv() {
  return useQuery({
    queryKey: queryKeys.realtime.tv(),
    queryFn: realtimeApi.tv,
    refetchInterval: REFRESCO_TIEMPO_REAL_MS,
    staleTime: REFRESCO_TIEMPO_REAL_MS / 2,
  });
}
