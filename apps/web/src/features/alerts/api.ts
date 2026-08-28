import type {
  Alerta,
  AlertaListQuery,
  AlertasResumen,
  AtenderAlertaInput,
  ConfirmarEventoInput,
  ConfirmarLoteInput,
  DescartarAlertaInput,
  Paginated,
  Umbrales,
  UmbralesInput,
} from '@mes/types';
import { api } from '@/services/api/client';

interface RespuestaAlerta {
  alerta: Alerta;
  resumen: AlertasResumen;
  ep?: number;
}

export const alertsApi = {
  list: (query: AlertaListQuery = {}) => api.get<Paginated<Alerta>>('/alertas', { ...query }),
  resumen: () => api.get<AlertasResumen>('/alertas/resumen'),
  recientes: (limit = 3) => api.get<{ data: Alerta[] }>('/alertas/recientes', { limit }),
  detail: (id: string) => api.get<Alerta>(`/alertas/${id}`),
  atender: (id: string, input: AtenderAlertaInput) =>
    api.post<RespuestaAlerta>(`/alertas/${id}/atender`, input),
  descartar: (id: string, input: DescartarAlertaInput) =>
    api.post<RespuestaAlerta>(`/alertas/${id}/descartar`, input),
  confirmar: (id: string, input: ConfirmarEventoInput) =>
    api.post<RespuestaAlerta>(`/alertas/${id}/confirmar`, input),
  confirmarLote: (input: ConfirmarLoteInput) =>
    api.post<{ data: Alerta[]; resumen: AlertasResumen; ep: number }>('/alertas/confirmar-lote', input),
  umbrales: () => api.get<Umbrales>('/alertas/umbrales'),
  guardarUmbrales: (input: UmbralesInput) => api.put<Umbrales>('/alertas/umbrales', input),
};
