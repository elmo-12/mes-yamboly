'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExportRequestInput, ReporteQuery } from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { reportsApi } from './api';

export function useIndicadores(query: ReporteQuery = {}) {
  return useQuery({
    queryKey: queryKeys.reports.indicadores(query),
    queryFn: () => reportsApi.indicadores(query),
  });
}

export function useReporteParadas(query: ReporteQuery = {}) {
  return useQuery({
    queryKey: queryKeys.reports.paradas(query),
    queryFn: () => reportsApi.paradas(query),
  });
}

export function useReporteMermas(query: ReporteQuery = {}) {
  return useQuery({
    queryKey: queryKeys.reports.mermas(query),
    queryFn: () => reportsApi.mermas(query),
  });
}

/**
 * Historial de exportaciones. Sondea cada 2 s **solo** mientras haya algún
 * archivo en estado `generando`; en reposo no hay peticiones periódicas.
 */
export function useExportaciones() {
  return useQuery({
    queryKey: queryKeys.reports.exportaciones(),
    queryFn: reportsApi.exportaciones,
    refetchInterval: (query) =>
      query.state.data?.data.some((job) => job.estado === 'generando') ? 2_000 : false,
  });
}

export function useExportar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExportRequestInput) => reportsApi.exportar(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reports.exportaciones() }),
  });
}
