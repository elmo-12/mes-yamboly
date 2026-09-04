import { z } from 'zod';
import type { PaginationQuery } from './common';

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
  accionTomada: z
    .string()
    .min(10, 'Describe la acción tomada (mínimo 10 caracteres)')
    .max(300, 'Máximo 300 caracteres'),
  numeroSolicitud: z.string().optional(),
  evidenciaUrl: z.string().optional(),
  afectaOee: z.boolean().default(true),
  responsableId: z.string().min(1, 'Selecciona un responsable'),
  origen: z.enum(ORIGENES_PARADA).default('manual'),
  deteccionId: z.string().optional(),
  tiempoRegistroSeg: z.coerce.number().min(0).default(0),
});
export type CreateParadaInput = z.infer<typeof createParadaSchema>;
export type CreateParada = CreateParadaInput;

export const updateParadaSchema = createParadaSchema.partial().extend({
  /** Corrección de la hora de fin desde el drawer "Editar parada" (spec 05.F). */
  fin: z.string().min(1).nullable().optional(),
  motivoEdicion: z.string().max(300).optional(),
});
export type UpdateParadaInput = z.infer<typeof updateParadaSchema>;

export const finalizeParadaSchema = z.object({
  fin: z.string().min(1, 'La hora de fin es obligatoria'),
  comentarioCierre: z.string().max(300, 'Máximo 300 caracteres').optional(),
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
  causaId: z.string().min(1, 'Selecciona una causa'),
  accionTomada: z.string().min(10, 'Describe la acción tomada').max(300),
  tiempoRegistroSeg: z.coerce.number().min(0).default(0),
});
export type ConfirmarDeteccionInput = z.infer<typeof confirmarDeteccionSchema>;
