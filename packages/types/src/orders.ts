import { z } from 'zod';
import type { PaginationQuery, Periodo, Turno } from './common';

export const ESTADOS_ORDEN = ['en_curso', 'cerrada', 'por_validar', 'validada', 'incompleta'] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

export const ESTADO_ORDEN_LABEL: Record<EstadoOrden, string> = {
  en_curso: 'En curso',
  cerrada: 'Cerrada',
  por_validar: 'Por validar',
  validada: 'Validada',
  incompleta: 'Incompleta',
};

export interface OeeDetalle {
  oee: number;
  disponibilidad: number;
  desempeno: number;
  calidad: number;
}

export interface Colaborador {
  id: string;
  nombre: string;
  iniciales: string;
  rol: string;
}

export interface OrdenFabricacion {
  id: string;
  /** `OF-2026-0815` */
  codigo: string;
  /** ISO `YYYY-MM-DD` */
  fecha: string;
  lineaId: string;
  productoId: string;
  turno: Turno;
  lote: string;
  /** ISO `YYYY-MM-DD` */
  vencimiento: string;
  planificado: number;
  producido: number;
  /** Conteo de la codificadora, para el control cruzado de calidad. */
  conteoCodificadora: number;
  velocidadEstandar: number;
  estado: EstadoOrden;
  maquinistaId: string;
  supervisorId: string;
  /** Nº de operarios del turno. */
  operarios: number;
  colaboradores: Colaborador[];
  oee: OeeDetalle;
  paradasCount: number;
  mermasKg: number;
  /** ISO-8601 con hora. */
  inicio: string;
  /** ISO-8601 con hora; `null` mientras la orden sigue en curso. */
  fin: string | null;
  observacion?: string;
}

/** Fila de listado con los textos ya resueltos (línea, producto, personas). */
export interface OrdenListItem extends OrdenFabricacion {
  lineaCodigo: string;
  lineaNombre: string;
  productoNombre: string;
  maquinistaNombre: string;
  supervisorNombre: string;
}

export interface OrdenListQuery extends PaginationQuery {
  periodo?: Periodo;
  desde?: string;
  hasta?: string;
  lineaId?: string | string[];
  turno?: Turno | Turno[];
  estado?: EstadoOrden | EstadoOrden[];
  search?: string;
  /** `fecha` | `codigo` | `oee` | `producido` */
  sort?: string;
  orden?: 'asc' | 'desc';
}

export interface OrdenesResumen {
  todas: number;
  porValidar: number;
  conParadas: number;
  conMermas: number;
  /** Fecha ISO de la última sincronización mostrada en el header. */
  ultimaSincronizacion: string;
}

/* ------------------------------------------------------------------ */
/* Mutaciones                                                          */
/* ------------------------------------------------------------------ */

export const createOrdenSchema = z.object({
  lineaId: z.string().min(1, 'Selecciona una línea'),
  productoId: z.string().min(1, 'Selecciona un producto'),
  codigo: z.string().regex(/^OF-\d{4}-\d{4}$/, 'Formato esperado OF-2026-0815'),
  lote: z.string().min(3, 'El lote es obligatorio'),
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  turno: z.enum(['M', 'T', 'N'] as const),
  planificado: z.coerce.number().int().positive('Debe ser mayor que 0'),
  maquinistaId: z.string().min(1, 'Selecciona un maquinista'),
  supervisorId: z.string().min(1, 'Selecciona un supervisor'),
  operarios: z.coerce.number().int().min(1, 'Debe haber al menos 1 operario'),
  colaboradorIds: z.array(z.string()).default([]),
});
export type CreateOrdenInput = z.infer<typeof createOrdenSchema>;
export type CreateOrden = CreateOrdenInput;

export const finalizeOrdenSchema = z.object({
  producido: z.coerce.number().int().min(0, 'Debe ser 0 o mayor'),
  conteoCodificadora: z.coerce.number().int().min(0, 'Debe ser 0 o mayor'),
  evidenciaUrl: z.string().optional(),
  comentario: z.string().max(500, 'Máximo 500 caracteres').optional(),
});
export type FinalizeOrdenInput = z.infer<typeof finalizeOrdenSchema>;
export type FinalizeOrden = FinalizeOrdenInput;

export const validateOrdenSchema = z.object({
  produccionRegistrada: z.literal(true, {
    errorMap: () => ({ message: 'Confirma la producción registrada' }),
  }),
  paradasConCausa: z.literal(true, {
    errorMap: () => ({ message: 'Confirma que las paradas tienen causa y acción' }),
  }),
  mermasClasificadas: z.literal(true, {
    errorMap: () => ({ message: 'Confirma que las mermas están clasificadas' }),
  }),
  evidenciaEtiqueta: z.literal(true, {
    errorMap: () => ({ message: 'Confirma la evidencia de etiqueta' }),
  }),
  observacion: z.string().max(500).optional(),
});
export type ValidateOrdenInput = z.infer<typeof validateOrdenSchema>;
export type ValidateOrden = ValidateOrdenInput;

/* ------------------------------------------------------------------ */
/* Bitácora (RF12)                                                     */
/* ------------------------------------------------------------------ */

export const TIPOS_AUDITORIA = [
  'creacion',
  'edicion',
  'parada',
  'merma',
  'velocidad',
  'validacion',
  'sistema',
] as const;
export type TipoAuditoria = (typeof TIPOS_AUDITORIA)[number];

export const TIPO_AUDITORIA_LABEL: Record<TipoAuditoria, string> = {
  creacion: 'Creación',
  edicion: 'Edición',
  parada: 'Parada',
  merma: 'Merma',
  velocidad: 'Velocidad',
  validacion: 'Validación',
  sistema: 'Sistema',
};

export interface AuditEvent {
  id: string;
  ordenId: string;
  /** ISO-8601 con hora. */
  fecha: string;
  usuario: string;
  usuarioIniciales: string;
  tipo: TipoAuditoria;
  texto: string;
}
