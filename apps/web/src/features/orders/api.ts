import type {
  AuditEvent,
  CreateOrdenInput,
  FinalizeOrdenInput,
  MermaListItem,
  OrdenesResumen,
  OrdenListItem,
  OrdenListQuery,
  Paginated,
  ParadaListItem,
  RegistroVelocidadListItem,
  ValidateOrdenInput,
} from '@mes/types';
import { api } from '@/services/api/client';
import type { QueryParams } from '@/services/api/client';

function toParams(query: OrdenListQuery): QueryParams {
  return {
    page: query.page,
    pageSize: query.pageSize,
    periodo: query.periodo,
    desde: query.desde,
    hasta: query.hasta,
    lineaId: Array.isArray(query.lineaId) ? query.lineaId : query.lineaId,
    turno: Array.isArray(query.turno) ? query.turno : query.turno,
    estado: Array.isArray(query.estado) ? query.estado : query.estado,
    search: query.search,
    sort: query.sort,
    orden: query.orden,
  };
}

export const ordersApi = {
  list: (query: OrdenListQuery = {}) =>
    api.get<Paginated<OrdenListItem>>('/ordenes', toParams(query)),
  resumen: () => api.get<OrdenesResumen>('/ordenes/resumen'),
  detail: (id: string) => api.get<OrdenListItem>(`/ordenes/${id}`),
  paradas: (id: string) =>
    api.get<{ data: ParadaListItem[]; resumen: { cantidad: number; minutos: number; afectanOee: number } }>(
      `/ordenes/${id}/paradas`
    ),
  mermas: (id: string) =>
    api.get<{ data: MermaListItem[]; resumen: { cantidad: number; kg: number } }>(`/ordenes/${id}/mermas`),
  velocidades: (id: string) =>
    api.get<{ data: RegistroVelocidadListItem[] }>(`/ordenes/${id}/velocidades`),
  bitacora: (id: string, tipo?: string[]) =>
    api.get<{ data: AuditEvent[] }>(`/ordenes/${id}/bitacora`, { tipo }),
  crear: (input: CreateOrdenInput) => api.post<OrdenListItem>('/ordenes', input),
  finalizar: (id: string, input: FinalizeOrdenInput) =>
    api.post<OrdenListItem>(`/ordenes/${id}/finalizar`, input),
  validar: (id: string, input: ValidateOrdenInput) =>
    api.post<OrdenListItem>(`/ordenes/${id}/validar`, input),
};
