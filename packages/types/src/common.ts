import { z } from 'zod';

/** Prefijo de todos los endpoints REST del MES. */
export const API_PREFIX = '/api/v1';

/* ------------------------------------------------------------------ */
/* Envolturas de respuesta                                             */
/* ------------------------------------------------------------------ */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Forma única de error de la API: `{ statusCode, code, message, details? }`. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RULE_VIOLATION',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/* ------------------------------------------------------------------ */
/* Consultas comunes                                                   */
/* ------------------------------------------------------------------ */

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface DateRange {
  /** ISO-8601 `YYYY-MM-DD` */
  desde: string;
  /** ISO-8601 `YYYY-MM-DD` */
  hasta: string;
}

export const PERIODOS = ['hoy', 'semana', 'mes', 'trimestre', 'personalizado'] as const;
export type Periodo = (typeof PERIODOS)[number];

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const dateRangeSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido'),
});

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

export const ROLES = ['jefe', 'supervisor', 'maquinista', 'calidad', 'mermas', 'investigador'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  jefe: 'Jefe de producción',
  supervisor: 'Supervisor',
  maquinista: 'Maquinista',
  calidad: 'Calidad',
  mermas: 'Encargado de merma',
  investigador: 'Investigador',
};

/* ------------------------------------------------------------------ */
/* Turnos                                                              */
/* ------------------------------------------------------------------ */

/**
 * Turnos reales de planta Yamboly: `D` Día 06:00–18:00 y `N` Noche 18:00–06:00.
 * Sustituyen al esquema anterior de 3 turnos (`M`/`T`/`N`).
 */
export const TURNOS = ['D', 'N'] as const;
export type Turno = (typeof TURNOS)[number];

export const TURNO_LABEL: Record<Turno, string> = {
  D: 'Día',
  N: 'Noche',
};

export interface TurnoInfo {
  codigo: Turno;
  label: string;
  /** `HH:mm` — `06:00` (D) · `18:00` (N) */
  inicio: string;
  /** `HH:mm` — `18:00` (D) · `06:00` (N, cruza medianoche) */
  fin: string;
}

/* ------------------------------------------------------------------ */
/* Tipos de proceso de línea                                           */
/* ------------------------------------------------------------------ */

/**
 * Las 9 líneas reales son máquinas físicas de tres familias de proceso:
 * 4 llenadoras (`LLEN-M2`, `LLEN-M1`, `LLEN-A1`, `LLEN-A2`),
 * 2 extrusoras (`EXTR-2`, `EXTR-3`) y 3 moldeadoras (`MOLD-A2`, `MOLD-A3`, `MOLD-A4`).
 */
export const TIPOS_PROCESO_LINEA = ['llenadora', 'extrusora', 'moldeadora'] as const;
export type TipoProcesoLinea = (typeof TIPOS_PROCESO_LINEA)[number];

export const TIPO_PROCESO_LABEL: Record<TipoProcesoLinea, string> = {
  llenadora: 'Llenadora',
  extrusora: 'Extrusora',
  moldeadora: 'Moldeadora',
};

/* ------------------------------------------------------------------ */
/* Sedes                                                               */
/* ------------------------------------------------------------------ */

export interface Sede {
  id: string;
  /** Código corto de 3–4 letras mayúsculas: `LIMA`, `AREQ`, `CHIC`, `TARA`. */
  codigo: string;
  /** `Arequipa`, `Lima`, … */
  nombre: string;
  ciudad: string;
  activa: boolean;
}

/** Alta/edición de sede (`POST /sedes`, `PATCH /sedes/:id`). */
export const sedeSchema = z.object({
  codigo: z
    .string()
    .regex(/^[A-Z]{3,4}$/, 'Formato esperado AREQ (3 o 4 letras mayúsculas)'),
  nombre: z.string().min(3, 'El nombre es obligatorio'),
  ciudad: z.string().min(3, 'La ciudad es obligatoria'),
  activa: z.boolean().default(true),
});
export type SedeInput = z.infer<typeof sedeSchema>;

/** Estado genérico de un registro de catálogo. */
export const ESTADOS_CATALOGO = ['activo', 'inactivo'] as const;
export type EstadoCatalogo = (typeof ESTADOS_CATALOGO)[number];

/* ------------------------------------------------------------------ */
/* Baja lógica                                                         */
/* ------------------------------------------------------------------ */

/**
 * Respuesta única de toda baja lógica (`DELETE /causas-parada/:id`,
 * `/causas-merma/:id`, `/maquinas/:id`, `/productos/:id`, `/velocidades-estandar/:id`, …).
 * Nunca hay borrado físico cuando existe histórico: el registro pasa a
 * `inactivo` (catálogos) o `baja` (máquinas) y se informa cuántos registros
 * históricos conservan el código.
 *
 * @example
 * { id: 'CPA-PN-02-01', codigo: 'PN-02-01', estado: 'inactivo',
 *   conservados: 14, etiquetaConservados: 'paradas históricas',
 *   mensaje: 'Hay 14 paradas históricas con esta causa; se conservarán con el código.' }
 */
export interface BajaLogicaResponse {
  id: string;
  codigo: string;
  estado: 'inactivo' | 'baja';
  /** Nº de registros históricos que conservan el código. */
  conservados: number;
  /** Texto en plural para el modal Danger: `paradas históricas`, `mermas históricas`, … */
  etiquetaConservados: string;
  mensaje: string;
}

/**
 * Forma histórica de la baja de causas de parada.
 * @deprecated Usa {@link BajaLogicaResponse}. La API sigue enviando
 * `paradasConservadas` junto a `conservados` durante la migración; el campo
 * se retirará cuando web y e2e consuman el genérico.
 */
export interface BajaCausaParadaResponse extends BajaLogicaResponse {
  /** @deprecated Alias de `conservados`. */
  paradasConservadas: number;
}

/** Semántica de tendencia usada en los KPI (`+2,1 pp vs ayer`). */
export interface Delta {
  valor: number;
  /** Unidad textual del delta: `pp`, `%`, `min`, … */
  unidad: string;
  /** `true` cuando subir es bueno (OEE) y `false` cuando subir es malo (merma). */
  favorableSiSube: boolean;
  /** Texto de referencia: `vs ayer`, `vs pretest`, `vs periodo anterior`. */
  referencia: string;
}
