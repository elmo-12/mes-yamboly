import { z } from 'zod';
import type { PaginationQuery } from './common';
import { TIPOS_MERMA } from './catalogs';
import type { TipoMermaCodigo } from './catalogs';

export interface Merma {
  id: string;
  ordenId: string;
  lineaId: string;
  tipo: TipoMermaCodigo;
  cantidadKg: number;
  /** Nombre del sabor (texto libre del maestro): `Capuccino`. */
  sabor: string;
  /** Raíz del árbol de causas de merma (`nivel: 'tipo'`), p. ej. `CME-MP-01`. */
  tipoCausaId: string;
  /** Nivel intermedio (`nivel: 'clasificacion'`), p. ej. `CME-MP-01-A`; `null` si la causa cuelga del tipo. */
  clasificacionId: string | null;
  /** Hoja seleccionada (`nivel: 'causa'`), p. ej. `CME-MP-01-01`. */
  causaId: string;
  /** N.º de solicitud exigido por causas con `requiereSolicitud`. */
  numeroSolicitud?: string | null;
  responsableId: string;
  /** Código del balde escaneado (QR) cuando la merma se recupera. */
  codigoBalde?: string;
  enviarPasteurizacion: boolean;
  /** ISO-8601 con hora. */
  registradaEn: string;
  /** Segundos de registro — alimenta el KPI TRI. */
  tiempoRegistroSeg: number;
  observacion?: string;
}

export interface MermaListItem extends Merma {
  lineaCodigo: string;
  causaCodigo: string;
  causaNombre: string;
  /** Nombre del nodo raíz (`tipoCausaId`): `Merma del proceso`. */
  tipoCausaNombre?: string;
  /** Nombre de la clasificación (`clasificacionId`): `Arranque`. */
  clasificacionNombre?: string | null;
  responsableNombre: string;
  ordenCodigo: string;
}

export interface MermaListQuery extends PaginationQuery {
  ordenId?: string;
  lineaId?: string;
  tipo?: TipoMermaCodigo;
  causaId?: string;
  desde?: string;
  hasta?: string;
}

export const createMermaSchema = z.object({
  ordenId: z.string().min(1, 'Orden requerida'),
  lineaId: z.string().min(1, 'Selecciona una línea'),
  tipo: z.enum(TIPOS_MERMA, { errorMap: () => ({ message: 'Selecciona el tipo de merma' }) }),
  cantidadKg: z.coerce
    .number()
    .positive('La cantidad debe ser mayor que 0')
    .max(500, 'Cantidad fuera de rango'),
  sabor: z.string().min(1, 'Selecciona un sabor'),
  tipoCausaId: z.string().min(1, 'Selecciona el tipo de producción'),
  clasificacionId: z.string().nullable().default(null),
  causaId: z.string().min(1, 'Selecciona una causa'),
  responsableId: z.string().min(1, 'Selecciona un responsable'),
  codigoBalde: z.string().optional(),
  enviarPasteurizacion: z.boolean().default(false),
  /**
   * `observacion` y `numeroSolicitud` son **condicionalmente obligatorios** según
   * los flags `requiereComentario` / `requiereSolicitud` de la causa elegida.
   * Esa regla depende del catálogo, así que NO se expresa en este zod base:
   * la valida el wizard (`MermaWizard`) y la API (422 con campo→mensaje).
   */
  observacion: z.string().max(300, 'Máximo 300 caracteres').optional(),
  numeroSolicitud: z.string().max(50, 'Máximo 50 caracteres').optional(),
  tiempoRegistroSeg: z.coerce.number().min(0).default(0),
});
export type CreateMermaInput = z.infer<typeof createMermaSchema>;
export type CreateMerma = CreateMermaInput;

export const updateMermaSchema = createMermaSchema.partial();
export type UpdateMermaInput = z.infer<typeof updateMermaSchema>;
