import type {
  ActualizarUsuarioInput,
  BajaCausaParadaResponse,
  BajaLogicaResponse,
  CausaMerma,
  CausaMermaInput,
  CausaMermaNodo,
  CausaParada,
  CausaParadaInput,
  CausaParadaNodo,
  Colaborador,
  CrearUsuarioInput,
  EstadoCatalogo,
  Linea,
  LineaInput,
  LineaListItem,
  NivelCausa,
  NivelCausaMerma,
  Producto,
  ProductoInput,
  RestablecerPasswordInput,
  Role,
  Sabor,
  TipoMermaCodigo,
  TipoProcesoLinea,
  TurnoDef,
  UpdateProductoInput,
  UpdateVelocidadEstandarInput,
  User,
  VelocidadEstandar,
  VelocidadEstandarInput,
  VelocidadEstandarListItem,
} from '@mes/types';
import { api } from '@/services/api/client';

interface Lista<T> {
  data: T[];
}

/* ------------------------------------------------------------------ */
/* Filtros de las consultas (espejo de los `*QueryDto` de la API)      */
/* ------------------------------------------------------------------ */

export interface SaborFiltros {
  estado?: EstadoCatalogo;
}

export interface LineaFiltros {
  tipoProceso?: TipoProcesoLinea;
  estado?: EstadoCatalogo;
}

export interface ProductoFiltros {
  /** Sólo productos con par producto × línea activo en esa línea. */
  lineaId?: string;
  /** Código, nombre o descripción. */
  search?: string;
  estado?: EstadoCatalogo;
}

export interface VelocidadEstandarFiltros {
  productoId?: string;
  lineaId?: string;
  estado?: EstadoCatalogo;
}

export interface CausaParadaFiltros {
  nivel?: NivelCausa;
  lineaId?: string;
}

export interface CausaMermaFiltros {
  nivel?: NivelCausaMerma;
  tipo?: TipoMermaCodigo;
  lineaId?: string;
}

export interface UsuarioFiltros {
  rol?: Role[];
  lineaId?: string;
  /** `true` sólo activos, `false` sólo inactivos, `undefined` todos. */
  activo?: boolean;
}

/**
 * Capa HTTP de los catálogos maestros y del directorio de usuarios.
 * Cubre los endpoints de `modules/catalogs` y `modules/users`; las vistas la
 * consumen siempre a través de `features/catalogs/hooks`.
 */
export const catalogsApi = {
  /* ----------------------------- Turnos ----------------------------- */
  turnos: () => api.get<Lista<TurnoDef>>('/turnos'),

  /* ----------------------------- Sabores ---------------------------- */
  sabores: (filtros: SaborFiltros = {}) => api.get<Lista<Sabor>>('/sabores', { ...filtros }),

  /* ------------------------------ Líneas ---------------------------- */
  /** La línea es la máquina física: `GET /lineas` es el mantenedor de las 9. */
  lineas: (filtros: LineaFiltros = {}) => api.get<Lista<LineaListItem>>('/lineas', { ...filtros }),
  crearLinea: (input: LineaInput) => api.post<Linea>('/lineas', input),
  actualizarLinea: (id: string, input: Partial<LineaInput>) =>
    api.patch<Linea>(`/lineas/${id}`, input),
  bajaLinea: (id: string) => api.del<BajaLogicaResponse>(`/lineas/${id}`),

  /* ---------------------------- Productos --------------------------- */
  productos: (filtros: ProductoFiltros = {}) =>
    api.get<Lista<Producto>>('/productos', { ...filtros }),
  crearProducto: (input: ProductoInput) => api.post<Producto>('/productos', input),
  actualizarProducto: (id: string, input: UpdateProductoInput) =>
    api.patch<Producto>(`/productos/${id}`, input),
  bajaProducto: (id: string) => api.del<BajaLogicaResponse>(`/productos/${id}`),

  /* ----------------------- Velocidades estándar --------------------- */
  velocidadesEstandar: (filtros: VelocidadEstandarFiltros = {}) =>
    api.get<Lista<VelocidadEstandarListItem>>('/velocidades-estandar', { ...filtros }),
  crearVelocidadEstandar: (input: VelocidadEstandarInput) =>
    api.post<VelocidadEstandar>('/velocidades-estandar', input),
  actualizarVelocidadEstandar: (id: string, input: UpdateVelocidadEstandarInput) =>
    api.patch<VelocidadEstandar>(`/velocidades-estandar/${id}`, input),
  bajaVelocidadEstandar: (id: string) =>
    api.del<BajaLogicaResponse>(`/velocidades-estandar/${id}`),

  /* -------------------------- Causas de parada ---------------------- */
  causasParadaArbol: (filtros: CausaParadaFiltros = {}) =>
    api.get<Lista<CausaParadaNodo>>('/causas-parada', { formato: 'arbol', ...filtros }),
  causasParadaPlano: (filtros: CausaParadaFiltros = {}) =>
    api.get<Lista<CausaParada>>('/causas-parada', { formato: 'plano', ...filtros }),
  crearCausaParada: (input: CausaParadaInput) => api.post<CausaParada>('/causas-parada', input),
  actualizarCausaParada: (id: string, input: Partial<CausaParadaInput>) =>
    api.patch<CausaParada>(`/causas-parada/${id}`, input),
  bajaCausaParada: (id: string) =>
    api.del<BajaCausaParadaResponse>(`/causas-parada/${id}`),

  /* --------------------------- Causas de merma ---------------------- */
  causasMermaArbol: (filtros: CausaMermaFiltros = {}) =>
    api.get<Lista<CausaMermaNodo>>('/causas-merma', { formato: 'arbol', ...filtros }),
  causasMermaPlano: (filtros: CausaMermaFiltros = {}) =>
    api.get<Lista<CausaMerma>>('/causas-merma', { formato: 'plano', ...filtros }),
  crearCausaMerma: (input: CausaMermaInput) => api.post<CausaMerma>('/causas-merma', input),
  actualizarCausaMerma: (id: string, input: Partial<CausaMermaInput>) =>
    api.patch<CausaMerma>(`/causas-merma/${id}`, input),
  bajaCausaMerma: (id: string) => api.del<BajaLogicaResponse>(`/causas-merma/${id}`),

  /* ----------------------------- Usuarios --------------------------- */
  usuarios: (filtros: UsuarioFiltros = {}) => api.get<Lista<User>>('/usuarios', { ...filtros }),
  /**
   * `confirmacion` es sólo del formulario: la API valida la contraseña una vez
   * y descarta los campos fuera del DTO (`whitelist`), así que no se envía.
   */
  crearUsuario: ({ confirmacion: _confirmacion, ...input }: CrearUsuarioInput) =>
    api.post<User>('/usuarios', input),
  actualizarUsuario: (id: string, input: ActualizarUsuarioInput) =>
    api.patch<User>(`/usuarios/${id}`, input),
  cambiarEstadoUsuario: (id: string, activo: boolean) =>
    api.post<User>(`/usuarios/${id}/estado`, { activo }),
  restablecerPassword: (id: string, { password }: RestablecerPasswordInput) =>
    api.post<User>(`/usuarios/${id}/restablecer-password`, { password }),

  /** Personas para los selectores de captura (responsable, maquinista, supervisor). */
  personas: (rol?: Role[], lineaId?: string) =>
    api.get<Lista<User>>('/usuarios', { rol, lineaId }),
  /** Cuadrilla del turno (paso "Equipo" de la orden). */
  colaboradores: () => api.get<Lista<Colaborador>>('/colaboradores'),
};
