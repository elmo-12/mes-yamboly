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
  sabor: string;
  causaId: string;
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
  causaId: z.string().min(1, 'Selecciona una causa'),
  responsableId: z.string().min(1, 'Selecciona un responsable'),
  codigoBalde: z.string().optional(),
  enviarPasteurizacion: z.boolean().default(false),
  observacion: z.string().max(300, 'Máximo 300 caracteres').optional(),
  tiempoRegistroSeg: z.coerce.number().min(0).default(0),
});
export type CreateMermaInput = z.infer<typeof createMermaSchema>;
export type CreateMerma = CreateMermaInput;

export const updateMermaSchema = createMermaSchema.partial();
export type UpdateMermaInput = z.infer<typeof updateMermaSchema>;
