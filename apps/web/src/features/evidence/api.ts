import type {
  CargarPretestInput,
  CrearInvitacionInput,
  EncuestaPublica,
  EncuestaRespuestaInput,
  EvaluacionTCI,
  EvaluacionTciQuery,
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaResumen,
  EvidenciaTRI,
  EvidenciaTSP,
  ExportEvidenciaInput,
  FuenteExternaResumen,
  ImportacionResultado,
  ImportacionResumen,
  InvitacionTSP,
  ListadoTCI,
  MapeoImportacion,
  OverrideTciInput,
  RegistroTRI,
  ResumenTCI,
  TipoFuenteExterna,
  ValidarTciInput,
  VerificacionCFS,
  VerificacionCfsInput,
} from '@mes/types';
import { api, descargarArchivo } from '@/services/api/client';

/** Query serializable de la lista de evaluaciones (`tipo` admite varios valores). */
function paramsTci(query: EvaluacionTciQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    tipo: query.tipo,
    resultado: query.resultado,
    desde: query.desde,
    hasta: query.hasta,
  };
}

/** `[]` o `{ data: [] }`: la API envuelve las colecciones, el mock puede no hacerlo. */
function lista<T>(respuesta: T[] | { data: T[] }): T[] {
  return Array.isArray(respuesta) ? respuesta : respuesta.data;
}

export const evidenceApi = {
  resumen: () => api.get<EvidenciaResumen>('/evidencia/resumen'),
  tri: () => api.get<EvidenciaTRI>('/evidencia/tri'),
  cargarPretest: (input: CargarPretestInput) =>
    api.post<{ data: RegistroTRI[]; promedioPretest: number }>('/evidencia/tri/pretest', input),

  /* --- TCI: fuentes externas, validación y evaluaciones --- */
  fuentes: async () =>
    lista(await api.get<FuenteExternaResumen[] | { data: FuenteExternaResumen[] }>('/evidencia/fuentes')),
  importacionesFuente: async (tipo: TipoFuenteExterna) =>
    lista(
      await api.get<ImportacionResumen[] | { data: ImportacionResumen[] }>(
        `/evidencia/fuentes/${tipo}/importaciones`,
      ),
    ),
  /** Descarga la plantilla XLSX de la fuente con la cabecera `Authorization`. */
  descargarPlantilla: (tipo: TipoFuenteExterna) =>
    descargarArchivo(`/evidencia/fuentes/${tipo}/plantilla`, `plantilla-${tipo.replace('_', '-')}.xlsx`),
  importarFuente: (tipo: TipoFuenteExterna, archivo: File, mapeo?: MapeoImportacion) => {
    const formData = new FormData();
    formData.append('archivo', archivo);
    if (mapeo && Object.keys(mapeo).length > 0) formData.append('mapeo', JSON.stringify(mapeo));
    return api.subirArchivo<ImportacionResultado>(`/evidencia/fuentes/${tipo}/importar`, formData);
  },

  tci: (query: EvaluacionTciQuery = {}) => api.get<ListadoTCI>('/evidencia/tci', paramsTci(query)),
  tciResumen: () => api.get<ResumenTCI>('/evidencia/tci/resumen'),
  validarTci: (input: ValidarTciInput) => api.post<ResumenTCI>('/evidencia/tci/validar', input),
  revisarTci: (id: string, input: OverrideTciInput) =>
    api.patch<{ item: EvaluacionTCI; resumen: ResumenTCI }>(`/evidencia/tci/${id}`, input),

  /* --- TSP --- */
  tsp: () => api.get<EvidenciaTSP>('/evidencia/tsp'),
  crearInvitacion: (input: CrearInvitacionInput) =>
    api.post<{ invitacion: InvitacionTSP; resumen: EvidenciaTSP }>(
      '/evidencia/tsp/invitaciones',
      input
    ),

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
