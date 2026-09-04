'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CargarPretestInput,
  CrearInvitacionInput,
  EncuestaRespuestaInput,
  EvaluacionTciQuery,
  ExportEvidenciaInput,
  MapeoImportacion,
  OverrideTciInput,
  TipoFuenteExterna,
  ValidarTciInput,
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

/* ------------------------------------------------------------------ */
/* TCI — fuentes externas, validación y evaluaciones                    */
/* ------------------------------------------------------------------ */

/** Página de evaluaciones + cabecera del TCI (`GET /evidencia/tci`). */
export function useEvidenciaTci(query: EvaluacionTciQuery = {}) {
  return useQuery({
    queryKey: queryKeys.evidence.tciList(query as Record<string, unknown>),
    queryFn: () => evidenceApi.tci(query),
  });
}

export function useFuentesExternas() {
  return useQuery({ queryKey: queryKeys.evidence.fuentes(), queryFn: evidenceApi.fuentes });
}

/** Historial de importaciones de una fuente; solo se pide con el modal abierto. */
export function useImportacionesFuente(tipo: TipoFuenteExterna, habilitado = true) {
  return useQuery({
    queryKey: queryKeys.evidence.importaciones(tipo),
    queryFn: () => evidenceApi.importacionesFuente(tipo),
    enabled: habilitado,
  });
}

/** Importar reemplaza el estado de las fuentes y deja el TCI por revalidar. */
export function useImportarFuente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tipo,
      archivo,
      mapeo,
    }: {
      tipo: TipoFuenteExterna;
      archivo: File;
      mapeo?: MapeoImportacion;
    }) => evidenceApi.importarFuente(tipo, archivo, mapeo),
    onSuccess: (_datos, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.fuentes() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.evidence.importaciones(variables.tipo),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.tci() });
    },
  });
}

/** Validar reescribe las evaluaciones del rango y mueve el KPI del resumen. */
export function useValidarTci() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ValidarTciInput) => evidenceApi.validarTci(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.tci() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.resumen() });
    },
  });
}

/** Override manual de criterios de una evaluación (vista 09.C). */
export function useRevisarEvaluacionTci() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OverrideTciInput }) =>
      evidenceApi.revisarTci(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.tci() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.resumen() });
    },
  });
}

/* ------------------------------------------------------------------ */
/* TSP · CFS · EP · exportación                                         */
/* ------------------------------------------------------------------ */

export function useEvidenciaTsp() {
  return useQuery({ queryKey: queryKeys.evidence.tsp(), queryFn: evidenceApi.tsp });
}

export function useCrearInvitacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearInvitacionInput) => evidenceApi.crearInvitacion(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.evidence.tsp() }),
  });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.tri() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.resumen() });
    },
  });
}

export function useActualizarCfs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VerificacionCfsInput }) =>
      evidenceApi.actualizarCfs(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.cfs() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.resumen() });
    },
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.tsp() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.evidence.resumen() });
    },
  });
}
