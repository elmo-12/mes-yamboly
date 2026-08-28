import type {
  ConfirmarDeteccionInput,
  CreateParadaInput,
  DeteccionIoT,
  FinalizeParadaInput,
  Paginated,
  ParadaListItem,
  ParadaListQuery,
  UpdateParadaInput,
} from '@mes/types';
import { api } from '@/services/api/client';

export const downtimesApi = {
  list: (query: ParadaListQuery = {}) =>
    api.get<Paginated<ParadaListItem>>('/paradas', { ...query }),
  crear: (input: CreateParadaInput) => api.post<ParadaListItem>('/paradas', input),
  actualizar: (id: string, input: UpdateParadaInput) =>
    api.patch<ParadaListItem>(`/paradas/${id}`, input),
  finalizar: (id: string, input: FinalizeParadaInput) =>
    api.post<ParadaListItem>(`/paradas/${id}/finalizar`, input),
  detecciones: (estado?: string) =>
    api.get<{ data: DeteccionIoT[] }>('/detecciones-iot', { estado }),
  confirmarDeteccion: (id: string, input: ConfirmarDeteccionInput) =>
    api.post<{ deteccion: DeteccionIoT; parada: ParadaListItem }>(
      `/detecciones-iot/${id}/confirmar`,
      input
    ),
  descartarDeteccion: (id: string) =>
    api.post<DeteccionIoT>(`/detecciones-iot/${id}/descartar`),
};
