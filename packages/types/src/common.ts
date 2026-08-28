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

export const TURNOS = ['M', 'T', 'N'] as const;
export type Turno = (typeof TURNOS)[number];

export const TURNO_LABEL: Record<Turno, string> = {
  M: 'Mañana',
  T: 'Tarde',
  N: 'Noche',
};

export interface TurnoInfo {
  codigo: Turno;
  label: string;
  /** `HH:mm` */
  inicio: string;
  /** `HH:mm` */
  fin: string;
}

/* ------------------------------------------------------------------ */
/* Sedes                                                               */
/* ------------------------------------------------------------------ */

export interface Sede {
  id: string;
  nombre: string;
  ciudad: string;
  activa: boolean;
}

/** Estado genérico de un registro de catálogo. */
export const ESTADOS_CATALOGO = ['activo', 'inactivo'] as const;
export type EstadoCatalogo = (typeof ESTADOS_CATALOGO)[number];

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
