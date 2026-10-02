import { z } from 'zod';
import { TIEMPO_REGISTRO_MAX_SEG } from './common';
import type { PaginationQuery } from './common';

/** ISO local de Lima sin zona: `2026-08-28T14:10:00` (segundos opcionales). */
export const ISO_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const tiempoRegistro = z.coerce
  .number()
  .int('El tiempo de registro debe ser un número entero de segundos')
  .min(0)
  .max(TIEMPO_REGISTRO_MAX_SEG, `El tiempo de registro no puede superar ${TIEMPO_REGISTRO_MAX_SEG} s`)
  .default(0);

export const ORIGENES_PARADA = ['manual', 'iot'] as const;
export type OrigenParada = (typeof ORIGENES_PARADA)[number];

export interface Parada {
  id: string;
  ordenId: string;
  lineaId: string;
  /** Causa específica (`PM-01-03`). */
  causaId: string;
  /** Causa raíz / tipo (`PM-01`). */
  tipoCausaId: string;
  /** ISO-8601 con hora. */
  inicio: string;
  /** ISO-8601 con hora; `null` mientras la parada sigue abierta. */
  fin: string | null;
  duracionMin: number;
  /** Obligatoria: qué se hizo para levantar la parada. */
  accionTomada: string;
  numeroSolicitud?: string;
  evidenciaUrl?: string;
  afectaOee: boolean;
  responsableId: string;
  origen: OrigenParada;
  /** Detección IoT vinculada, cuando la parada nació de un sensor. */
  deteccionId?: string;
  /** Segundos que tardó el registro en la app — alimenta el KPI TRI. */
  tiempoRegistroSeg: number;
  comentarioCierre?: string;
}

/** Fila con textos resueltos para tablas. */
export interface ParadaListItem extends Parada {
  lineaCodigo: string;
  causaCodigo: string;
  causaNombre: string;
  tipoCausaCodigo: string;
  tipoCausaNombre: string;
  /**
   * Clasificación heredada del tipo raíz (`PP-01` es programada; el resto,
   * imprevista). No es lo mismo que `afectaOee`: un refrigerio es programado y
   * aun así descuenta disponibilidad.
   */
  clasificacion: 'programada' | 'imprevista';
  responsableNombre: string;
  ordenCodigo: string;
}

export interface ParadaListQuery extends PaginationQuery {
  ordenId?: string;
  lineaId?: string;
  causaId?: string;
  desde?: string;
  hasta?: string;
  abiertas?: boolean;
}

export const createParadaSchema = z.object({
  ordenId: z.string().min(1, 'Orden requerida'),
  lineaId: z.string().min(1, 'Selecciona una línea'),
  tipoCausaId: z.string().min(1, 'Selecciona el tipo de parada'),
  causaId: z.string().min(1, 'Selecciona la causa específica'),
  inicio: z.string().min(1, 'La hora de inicio es obligatoria'),
  /** Parada retroactiva ya cerrada (ISO local). */
  fin: z.string().regex(ISO_LOCAL_REGEX, 'Fecha y hora inválidas').optional(),
  accionTomada: z
    .string()
    .trim()
    .min(10, 'Describe la acción tomada (mínimo 10 caracteres)')
    .max(300, 'Máximo 300 caracteres'),
  numeroSolicitud: z.string().trim().max(50, 'Máximo 50 caracteres').optional(),
  evidenciaUrl: z.string().max(200).optional(),
  afectaOee: z.boolean().default(true),
  responsableId: z.string().min(1, 'Selecciona un responsable'),
  origen: z.enum(ORIGENES_PARADA).default('manual'),
  deteccionId: z.string().optional(),
  tiempoRegistroSeg: tiempoRegistro,
});
export type CreateParadaInput = z.infer<typeof createParadaSchema>;
export type CreateParada = CreateParadaInput;

export const updateParadaSchema = createParadaSchema.partial().extend({
  /** Corrección de la hora de fin desde el drawer "Editar parada" (spec 05.F). */
  fin: z.string().regex(ISO_LOCAL_REGEX, 'Fecha y hora inválidas').nullable().optional(),
  motivoEdicion: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
});
export type UpdateParadaInput = z.infer<typeof updateParadaSchema>;

export const finalizeParadaSchema = z.object({
  fin: z.string().min(1, 'La hora de fin es obligatoria'),
  comentarioCierre: z.string().trim().max(300, 'Máximo 300 caracteres').optional(),
});
export type FinalizeParadaInput = z.infer<typeof finalizeParadaSchema>;
export type FinalizeParada = FinalizeParadaInput;

/* ------------------------------------------------------------------ */
/* Detecciones IoT                                                     */
/* ------------------------------------------------------------------ */

export const ESTADOS_DETECCION = ['sugerida', 'confirmada', 'descartada'] as const;
export type EstadoDeteccion = (typeof ESTADOS_DETECCION)[number];

export interface DeteccionIoT {
  id: string;
  lineaId: string;
  lineaCodigo: string;
  /** ISO-8601 con hora — `14:02` en la spec 03.A/04.K. */
  detectadaEn: string;
  /** Minutos sin movimiento detectados por el sensor. */
  minutos: number;
  estado: EstadoDeteccion;
  /** Parada creada al confirmar. */
  paradaId?: string;
  texto: string;
}

export const confirmarDeteccionSchema = z.object({
  /** Causa **específica** (hoja del árbol), no el tipo. */
  causaId: z.string().min(1, 'Selecciona una causa'),
  accionTomada: z
    .string()
    .trim()
    .min(10, 'Describe la acción tomada (mínimo 10 caracteres)')
    .max(300, 'Máximo 300 caracteres'),
  numeroSolicitud: z.string().trim().max(50, 'Máximo 50 caracteres').optional(),
  evidenciaUrl: z.string().max(200).optional(),
  tiempoRegistroSeg: tiempoRegistro,
});
export type ConfirmarDeteccionInput = z.infer<typeof confirmarDeteccionSchema>;
