import type { EstadoLinea, LineaTimeline, TiempoRealResumen, TvResumen } from '@mes/types';
import { api, buildUrl, tokenActual } from '@/services/api/client';

/** Yamboly opera una única planta: `/tiempo-real/*` ya no recibe `sedeId`. */
export interface TiempoRealFiltros {
  lineaId?: string[];
  estado?: EstadoLinea[];
}

export const realtimeApi = {
  lineas: (filtros: TiempoRealFiltros = {}) =>
    api.get<TiempoRealResumen>('/tiempo-real/lineas', { ...filtros }),
  timeline: (lineaId: string) => api.get<LineaTimeline>(`/tiempo-real/lineas/${lineaId}/timeline`),
  tv: () => api.get<TvResumen>('/tiempo-real/tv'),
  /**
   * URL del canal SSE; la consume `EventSource`, que no admite cabeceras: por eso
   * el token viaja en la query (el backend sólo lo acepta en esta ruta).
   */
  streamUrl: () => buildUrl('/tiempo-real/stream', { token: tokenActual() ?? undefined }),
};
