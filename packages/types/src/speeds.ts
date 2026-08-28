import { z } from 'zod';
import type { PaginationQuery } from './common';

export interface RegistroVelocidad {
  id: string;
  ordenId: string;
  lineaId: string;
  /** ISO-8601 con hora. */
  registradaEn: string;
  /** Unidades por minuto medidas. */
  velocidadReal: number;
  velocidadEstandar: number;
  /** Porcentaje con signo: `-1,7` significa 1,7 % por debajo del estándar. */
  desvioPct: number;
  motivo?: string;
  responsableId: string;
  tiempoRegistroSeg: number;
}

export interface RegistroVelocidadListItem extends RegistroVelocidad {
  lineaCodigo: string;
  ordenCodigo: string;
  responsableNombre: string;
}

export interface VelocidadListQuery extends PaginationQuery {
  ordenId?: string;
  lineaId?: string;
  desde?: string;
  hasta?: string;
}

export const createVelocidadSchema = z.object({
  ordenId: z.string().min(1, 'Orden requerida'),
  lineaId: z.string().min(1, 'Selecciona una línea'),
  velocidadReal: z.coerce
    .number()
    .positive('La velocidad debe ser mayor que 0')
    .max(1000, 'Velocidad fuera de rango'),
  motivo: z.string().max(200, 'Máximo 200 caracteres').optional(),
  responsableId: z.string().min(1, 'Selecciona un responsable'),
  tiempoRegistroSeg: z.coerce.number().min(0).default(0),
});
export type CreateVelocidadInput = z.infer<typeof createVelocidadSchema>;
export type CreateVelocidad = CreateVelocidadInput;
