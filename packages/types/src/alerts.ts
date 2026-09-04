import { z } from 'zod';
import type { PaginationQuery } from './common';

export const TIPOS_ALERTA = ['parada_prevista', 'merma_prevista', 'velocidad_baja', 'oee_bajo'] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export const TIPO_ALERTA_LABEL: Record<TipoAlerta, string> = {
  parada_prevista: 'Parada prevista',
  merma_prevista: 'Merma prevista',
  velocidad_baja: 'Velocidad baja',
  oee_bajo: 'OEE bajo umbral',
};

export const SEVERIDADES_ALERTA = ['critica', 'alta', 'media'] as const;
export type SeveridadAlerta = (typeof SEVERIDADES_ALERTA)[number];

export const SEVERIDAD_ALERTA_LABEL: Record<SeveridadAlerta, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
};

export const ESTADOS_ALERTA = ['activa', 'atendida', 'vencida', 'confirmada', 'descartada'] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];

export const ESTADO_ALERTA_LABEL: Record<EstadoAlerta, string> = {
  activa: 'Activa',
  atendida: 'Atendida',
  vencida: 'Vencida',
  confirmada: 'Confirmada',
  descartada: 'Descartada',
};

export interface FactorAlerta {
  texto: string;
  /** Contribución 0–100 usada por la barra del drawer 07.B. */
  contribucion: number;
}

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  /** Texto de la predicción: `Parada PM-01 en L2 en 40 min`. */
  prediccion: string;
  /** Probabilidad 0–100. */
  probabilidad: number;
  /** ISO-8601 con hora. */
  ventanaInicio: string;
  ventanaFin: string;
  estado: EstadoAlerta;
  /** `null` mientras el evento real no se ha confirmado — alimenta EP. */
  acierto: boolean | null;
  factores: FactorAlerta[];
  accionTomada?: string;
  observacion?: string;
  generadaEn: string;
  atendidaPor?: string;
  atendidaEn?: string;
}

export interface AlertaListQuery extends PaginationQuery {
  tipo?: TipoAlerta | TipoAlerta[];
  severidad?: SeveridadAlerta | SeveridadAlerta[];
  lineaId?: string | string[];
  estado?: EstadoAlerta | EstadoAlerta[];
  desde?: string;
  hasta?: string;
  search?: string;
}

export interface AlertasResumen {
  activas: number;
  atendidasHoy: number;
  pendientesConfirmar: number;
  vencidas: number;
  /** EP acumulada mostrada en el header 07.A. */
  epAcumulada: number;
}

/* ------------------------------------------------------------------ */
/* Mutaciones                                                          */
/* ------------------------------------------------------------------ */

export const atenderAlertaSchema = z.object({
  accionTomada: z
    .string()
    .min(10, 'Describe la acción tomada (mínimo 10 caracteres)')
    .max(300, 'Máximo 300 caracteres'),
});
export type AtenderAlertaInput = z.infer<typeof atenderAlertaSchema>;
export type AtenderAlerta = AtenderAlertaInput;

export const descartarAlertaSchema = z.object({
  motivo: z.string().min(5, 'Indica el motivo del descarte').max(300, 'Máximo 300 caracteres'),
});
export type DescartarAlertaInput = z.infer<typeof descartarAlertaSchema>;
export type DescartarAlerta = DescartarAlertaInput;

export const confirmarEventoSchema = z.object({
  ocurrio: z.boolean({ required_error: 'Indica si el evento ocurrió' }),
  observacion: z.string().max(300, 'Máximo 300 caracteres').optional(),
});
export type ConfirmarEventoInput = z.infer<typeof confirmarEventoSchema>;
export type ConfirmarEvento = ConfirmarEventoInput;

export const confirmarLoteSchema = z.object({
  confirmaciones: z
    .array(
      z.object({
        alertaId: z.string().min(1),
        ocurrio: z.boolean(),
        observacion: z.string().max(300).optional(),
      })
    )
    .min(1, 'Confirma al menos una alerta'),
});
export type ConfirmarLoteInput = z.infer<typeof confirmarLoteSchema>;

/* ------------------------------------------------------------------ */
/* Umbrales (spec 07.F / 10.C)                                         */
/* ------------------------------------------------------------------ */

export interface Umbrales {
  velocidadBajoEstandarPct: number;
  oeeMinimo: number;
  probabilidadMinima: number;
  notificarN8n: boolean;
  mostrarTv: boolean;
  /**
   * Tolerancia en minutos al comparar horas registradas contra las lecturas de
   * sensor en la validación de calidad (TCI). Por defecto ±5 min.
   */
  tciToleranciaMin: number;
  /**
   * Tolerancia porcentual al comparar cantidades (kg de merma vs SAP) y
   * velocidades (u/min registradas vs sensor). Por defecto ±5 %.
   */
  tciToleranciaPct: number;
  /**
   * Días de holgura entre la fecha de la merma y la de su transferencia SAP.
   * Por defecto ±1 día.
   */
  tciToleranciaDiasSap: number;
  actualizadoEn: string;
  actualizadoPor: string;
}

export const umbralesSchema = z.object({
  velocidadBajoEstandarPct: z.coerce
    .number()
    .min(1, 'Mínimo 1 %')
    .max(50, 'Máximo 50 %'),
  oeeMinimo: z.coerce.number().min(1, 'Mínimo 1 %').max(100, 'Máximo 100 %'),
  probabilidadMinima: z.coerce.number().min(50, 'Mínimo 50 %').max(99, 'Máximo 99 %'),
  notificarN8n: z.boolean().default(false),
  mostrarTv: z.boolean().default(true),
  /* --- Validación de calidad (TCI) · sección de Configuración 10.C --- */
  tciToleranciaMin: z.coerce.number().min(0, 'Mínimo 0 min').max(60, 'Máximo 60 min').default(5),
  tciToleranciaPct: z.coerce.number().min(0, 'Mínimo 0 %').max(50, 'Máximo 50 %').default(5),
  tciToleranciaDiasSap: z.coerce
    .number()
    .int('Debe ser un número entero de días')
    .min(0, 'Mínimo 0 días')
    .max(15, 'Máximo 15 días')
    .default(1),
});
export type UmbralesInput = z.infer<typeof umbralesSchema>;
