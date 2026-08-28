import type {
  CausaMerma,
  CausaParada,
  CausaParadaNodo,
  Linea,
  Maquina,
  MaquinaInput,
  CausaParadaInput,
  Colaborador,
  Producto,
  Role,
  Sede,
  TurnoDef,
  User,
} from '@mes/types';
import { api } from '@/services/api/client';

interface Lista<T> {
  data: T[];
}

export const catalogsApi = {
  sedes: () => api.get<Lista<Sede>>('/sedes'),
  turnos: () => api.get<Lista<TurnoDef>>('/turnos'),
  lineas: (sedeId?: string) => api.get<Lista<Linea>>('/lineas', { sedeId }),
  productos: (lineaId?: string) => api.get<Lista<Producto>>('/productos', { lineaId }),
  actualizarProducto: (id: string, input: { velocidadEstandar: number }) =>
    api.patch<Producto>(`/productos/${id}`, input),
  usuarios: (sedeId?: string) => api.get<Lista<User>>('/usuarios', { sedeId }),
  maquinas: (lineaId?: string, estado?: string[]) =>
    api.get<Lista<Maquina>>('/maquinas', { lineaId, estado }),
  crearMaquina: (input: MaquinaInput) => api.post<Maquina>('/maquinas', input),
  actualizarMaquina: (id: string, input: Partial<MaquinaInput>) =>
    api.patch<Maquina>(`/maquinas/${id}`, input),
  causasParadaArbol: (lineaId?: string) =>
    api.get<Lista<CausaParadaNodo>>('/causas-parada', { formato: 'arbol', lineaId }),
  causasParadaPlano: (nivel?: string, lineaId?: string) =>
    api.get<Lista<CausaParada>>('/causas-parada', { formato: 'plano', nivel, lineaId }),
  crearCausaParada: (input: CausaParadaInput) => api.post<CausaParada>('/causas-parada', input),
  actualizarCausaParada: (id: string, input: Partial<CausaParadaInput>) =>
    api.patch<CausaParada>(`/causas-parada/${id}`, input),
  eliminarCausaParada: (id: string) =>
    api.del<{ id: string; codigo: string; paradasConservadas: number; mensaje: string }>(
      `/causas-parada/${id}`
    ),
  causasMerma: (tipo?: string) => api.get<Lista<CausaMerma>>('/causas-merma', { tipo }),
  /** Personas para los selectores de captura (responsable, maquinista, supervisor). */
  personas: (rol?: Role[], lineaId?: string) =>
    api.get<Lista<User>>('/usuarios', { rol, lineaId }),
  /** Cuadrilla del turno (paso "Equipo" de la orden). */
  colaboradores: () => api.get<Lista<Colaborador>>('/colaboradores'),
};
