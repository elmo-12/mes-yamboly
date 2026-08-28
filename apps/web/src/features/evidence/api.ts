import type {
  CargarPretestInput,
  EncuestaPublica,
  EncuestaRespuestaInput,
  EncuestaTSP,
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaResumen,
  EvidenciaTCI,
  EvidenciaTRI,
  ExportEvidenciaInput,
  RegistroTRI,
  VerificacionCFS,
  VerificacionCfsInput,
} from '@mes/types';
import { api } from '@/services/api/client';

export const evidenceApi = {
  resumen: () => api.get<EvidenciaResumen>('/evidencia/resumen'),
  tri: () => api.get<EvidenciaTRI>('/evidencia/tri'),
  cargarPretest: (input: CargarPretestInput) =>
    api.post<{ data: RegistroTRI[]; promedioPretest: number }>('/evidencia/tri/pretest', input),
  tci: () => api.get<EvidenciaTCI>('/evidencia/tci'),
  tsp: () => api.get<EncuestaTSP>('/evidencia/tsp'),
  cfs: () => api.get<EvidenciaCFS>('/evidencia/cfs'),
  actualizarCfs: (id: string, input: VerificacionCfsInput) =>
    api.patch<{ item: VerificacionCFS; resumen: { cumplidas: number; totales: number; porcentaje: number } }>(
      `/evidencia/cfs/${id}`,
      input
    ),
  ep: () => api.get<EvidenciaEP>('/evidencia/ep'),
  exportar: (input: ExportEvidenciaInput) =>
    api.post<{ id: string; estado: string }>('/evidencia/exportar', input),
  encuesta: (token: string) => api.get<EncuestaPublica>(`/encuesta/${token}`),
  responderEncuesta: (token: string, input: EncuestaRespuestaInput) =>
    api.post<{ recibido: boolean; respuestas: number; pctAcuerdo: number }>(`/encuesta/${token}`, input),
};
