import type {
  ExportJob,
  ExportRequestInput,
  IndicadoresResumen,
  MermasResumen,
  ParadasResumen,
  ReporteQuery,
} from '@mes/types';
import { api } from '@/services/api/client';

export const reportsApi = {
  indicadores: (query: ReporteQuery = {}) =>
    api.get<IndicadoresResumen>('/reportes/indicadores', { ...query }),
  paradas: (query: ReporteQuery = {}) => api.get<ParadasResumen>('/reportes/paradas', { ...query }),
  mermas: (query: ReporteQuery = {}) => api.get<MermasResumen>('/reportes/mermas', { ...query }),
  exportaciones: () => api.get<{ data: ExportJob[] }>('/reportes/exportaciones'),
  exportar: (input: ExportRequestInput) => api.post<ExportJob>('/reportes/exportar', input),
};
