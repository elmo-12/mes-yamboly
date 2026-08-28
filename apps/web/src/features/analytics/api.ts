import type {
  AnaliticaResumen,
  EstadoDatos,
  Modelo,
  Patrones,
  Predicciones,
  ReentrenamientoJob,
} from '@mes/types';
import { api } from '@/services/api/client';

export const analyticsApi = {
  resumen: () => api.get<AnaliticaResumen>('/analitica/resumen'),
  patrones: () => api.get<Patrones>('/analitica/patrones'),
  predicciones: () => api.get<Predicciones>('/analitica/predicciones'),
  modelo: () => api.get<Modelo>('/analitica/modelo'),
  /** `estado=insuficiente` fuerza la variante «fase de acumulación» (spec 08.E). */
  estadoDatos: (estado?: string) =>
    api.get<EstadoDatos>('/analitica/estado-datos', estado ? { estado } : undefined),
  reentrenar: () => api.post<ReentrenamientoJob>('/analitica/reentrenar'),
  activarVersion: (version: string) => api.post<Modelo>(`/analitica/modelo/${version}/activar`),
};
