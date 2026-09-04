import type { AlertaListQuery, OrdenListQuery, ReporteQuery } from '@mes/types';

/**
 * Filtros serializables de una consulta de catálogo (`{ lineaId, estado, … }`).
 * Forman parte de la clave, así que cada combinación cachea por separado.
 */
export type CatalogoFiltros = Readonly<
  Record<string, string | number | boolean | readonly string[] | undefined>
>;

/** Fábrica de claves de TanStack Query por dominio. */
export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
  },
  /**
   * Catálogos maestros. Cada entidad expone una **raíz** sin argumentos
   * (`sedes()`, `productos()`, …) que sirve para invalidar todas sus consultas,
   * y una variante `…List(filtros)` con los filtros de la llamada. TanStack
   * empareja por prefijo, así que invalidar la raíz alcanza a todas las listas.
   */
  catalogs: {
    all: ['catalogs'] as const,
    sedes: () => [...queryKeys.catalogs.all, 'sedes'] as const,
    turnos: () => [...queryKeys.catalogs.all, 'turnos'] as const,
    sabores: () => [...queryKeys.catalogs.all, 'sabores'] as const,
    saboresList: (filtros: CatalogoFiltros = {}) => [...queryKeys.catalogs.sabores(), filtros] as const,
    lineas: () => [...queryKeys.catalogs.all, 'lineas'] as const,
    lineasList: (filtros: CatalogoFiltros = {}) => [...queryKeys.catalogs.lineas(), filtros] as const,
    productos: () => [...queryKeys.catalogs.all, 'productos'] as const,
    productosList: (filtros: CatalogoFiltros = {}) => [...queryKeys.catalogs.productos(), filtros] as const,
    velocidades: () => [...queryKeys.catalogs.all, 'velocidades-estandar'] as const,
    velocidadesList: (filtros: CatalogoFiltros = {}) => [...queryKeys.catalogs.velocidades(), filtros] as const,
    maquinas: () => [...queryKeys.catalogs.all, 'maquinas'] as const,
    maquinasList: (filtros: CatalogoFiltros = {}) => [...queryKeys.catalogs.maquinas(), filtros] as const,
    causasParada: () => [...queryKeys.catalogs.all, 'causas-parada'] as const,
    causasParadaArbol: (filtros: CatalogoFiltros = {}) =>
      [...queryKeys.catalogs.causasParada(), 'arbol', filtros] as const,
    causasParadaPlano: (filtros: CatalogoFiltros = {}) =>
      [...queryKeys.catalogs.causasParada(), 'plano', filtros] as const,
    causasMerma: () => [...queryKeys.catalogs.all, 'causas-merma'] as const,
    causasMermaArbol: (filtros: CatalogoFiltros = {}) =>
      [...queryKeys.catalogs.causasMerma(), 'arbol', filtros] as const,
    causasMermaPlano: (filtros: CatalogoFiltros = {}) =>
      [...queryKeys.catalogs.causasMerma(), 'plano', filtros] as const,
    usuarios: () => [...queryKeys.catalogs.all, 'usuarios'] as const,
    usuariosList: (filtros: CatalogoFiltros = {}) => [...queryKeys.catalogs.usuarios(), filtros] as const,
    personas: (filtros: CatalogoFiltros = {}) => [...queryKeys.catalogs.usuarios(), 'personas', filtros] as const,
    colaboradores: () => [...queryKeys.catalogs.all, 'colaboradores'] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (query: OrdenListQuery) => [...queryKeys.orders.all, 'list', query] as const,
    resumen: () => [...queryKeys.orders.all, 'resumen'] as const,
    detail: (id: string) => [...queryKeys.orders.all, 'detail', id] as const,
    paradas: (id: string) => [...queryKeys.orders.all, 'detail', id, 'paradas'] as const,
    mermas: (id: string) => [...queryKeys.orders.all, 'detail', id, 'mermas'] as const,
    velocidades: (id: string) => [...queryKeys.orders.all, 'detail', id, 'velocidades'] as const,
    bitacora: (id: string) => [...queryKeys.orders.all, 'detail', id, 'bitacora'] as const,
  },
  downtimes: {
    all: ['downtimes'] as const,
    list: (query: Record<string, unknown>) => [...queryKeys.downtimes.all, 'list', query] as const,
    detecciones: (estado?: string) => [...queryKeys.downtimes.all, 'detecciones', estado ?? 'todas'] as const,
  },
  scrap: {
    all: ['scrap'] as const,
    list: (query: Record<string, unknown>) => [...queryKeys.scrap.all, 'list', query] as const,
  },
  speeds: {
    all: ['speeds'] as const,
    list: (query: Record<string, unknown>) => [...queryKeys.speeds.all, 'list', query] as const,
  },
  realtime: {
    all: ['realtime'] as const,
    lineas: (filtros?: Record<string, unknown>) => [...queryKeys.realtime.all, 'lineas', filtros ?? {}] as const,
    timeline: (lineaId: string) => [...queryKeys.realtime.all, 'timeline', lineaId] as const,
    tv: () => [...queryKeys.realtime.all, 'tv'] as const,
  },
  reports: {
    all: ['reports'] as const,
    indicadores: (query: ReporteQuery) => [...queryKeys.reports.all, 'indicadores', query] as const,
    paradas: (query: ReporteQuery) => [...queryKeys.reports.all, 'paradas', query] as const,
    mermas: (query: ReporteQuery) => [...queryKeys.reports.all, 'mermas', query] as const,
    exportaciones: () => [...queryKeys.reports.all, 'exportaciones'] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    list: (query: AlertaListQuery) => [...queryKeys.alerts.all, 'list', query] as const,
    resumen: () => [...queryKeys.alerts.all, 'resumen'] as const,
    recientes: () => [...queryKeys.alerts.all, 'recientes'] as const,
    detail: (id: string) => [...queryKeys.alerts.all, 'detail', id] as const,
    umbrales: () => [...queryKeys.alerts.all, 'umbrales'] as const,
  },
  analytics: {
    all: ['analytics'] as const,
    resumen: () => [...queryKeys.analytics.all, 'resumen'] as const,
    patrones: () => [...queryKeys.analytics.all, 'patrones'] as const,
    predicciones: () => [...queryKeys.analytics.all, 'predicciones'] as const,
    modelo: () => [...queryKeys.analytics.all, 'modelo'] as const,
    estadoDatos: (estado?: string) => [...queryKeys.analytics.all, 'estado-datos', estado ?? 'real'] as const,
  },
  evidence: {
    all: ['evidence'] as const,
    resumen: () => [...queryKeys.evidence.all, 'resumen'] as const,
    tri: () => [...queryKeys.evidence.all, 'tri'] as const,
    tci: () => [...queryKeys.evidence.all, 'tci'] as const,
    tsp: () => [...queryKeys.evidence.all, 'tsp'] as const,
    cfs: () => [...queryKeys.evidence.all, 'cfs'] as const,
    ep: () => [...queryKeys.evidence.all, 'ep'] as const,
    encuesta: (token: string) => [...queryKeys.evidence.all, 'encuesta', token] as const,
  },
} as const;
