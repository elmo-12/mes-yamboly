'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CargarPretestInput,
  EncuestaRespuestaInput,
  ExportEvidenciaInput,
  VerificacionCfsInput,
} from '@mes/types';
import { queryKeys } from '@/services/api/query-keys';
import { evidenceApi } from './api';

export function useEvidenciaResumen() {
  return useQuery({ queryKey: queryKeys.evidence.resumen(), queryFn: evidenceApi.resumen });
}

export function useEvidenciaTri() {
  return useQuery({ queryKey: queryKeys.evidence.tri(), queryFn: evidenceApi.tri });
}

export function useEvidenciaTci() {
  return useQuery({ queryKey: queryKeys.evidence.tci(), queryFn: evidenceApi.tci });
}

export function useEvidenciaTsp() {
  return useQuery({ queryKey: queryKeys.evidence.tsp(), queryFn: evidenceApi.tsp });
}

export function useEvidenciaCfs() {
  return useQuery({ queryKey: queryKeys.evidence.cfs(), queryFn: evidenceApi.cfs });
}

export function useEvidenciaEp() {
  return useQuery({ queryKey: queryKeys.evidence.ep(), queryFn: evidenceApi.ep });
}

export function useCargarPretest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CargarPretestInput) => evidenceApi.cargarPretest(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all }),
  });
}

export function useActualizarCfs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VerificacionCfsInput }) =>
      evidenceApi.actualizarCfs(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all }),
  });
}

export function useExportarEvidencia() {
  return useMutation({ mutationFn: (input: ExportEvidenciaInput) => evidenceApi.exportar(input) });
}

export function useEncuesta(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.evidence.encuesta(token ?? ''),
    queryFn: () => evidenceApi.encuesta(token as string),
    enabled: Boolean(token),
  });
}

export function useResponderEncuesta(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EncuestaRespuestaInput) => evidenceApi.responderEncuesta(token, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.evidence.all }),
  });
}
