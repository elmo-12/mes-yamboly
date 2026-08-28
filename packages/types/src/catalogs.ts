import { z } from 'zod';
import type { EstadoCatalogo, Turno, TurnoInfo } from './common';

/* ------------------------------------------------------------------ */
/* Líneas                                                              */
/* ------------------------------------------------------------------ */

export interface Linea {
  id: string;
  /** `L1`, `L2`, … `PT-01` para el pasteurizador. */
  codigo: string;
  /** `Paletas`, `Conos`, … */
  nombre: string;
  sedeId: string;
  estado: EstadoCatalogo;
  /** Unidades por minuto nominales de la línea. */
  capacidadUnidadesMin: number;
}

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  sabor: string;
  /** Presentación comercial: `120 ml`, `70 g`, … */
  presentacion: string;
  lineaId: string;
  /** Unidades por minuto de referencia para el cálculo de desempeño. */
  velocidadEstandar: number;
  estado: EstadoCatalogo;
}

/* ------------------------------------------------------------------ */
/* Máquinas                                                            */
/* ------------------------------------------------------------------ */

export const ESTADOS_MAQUINA = ['operativa', 'mantenimiento', 'baja'] as const;
export type EstadoMaquina = (typeof ESTADOS_MAQUINA)[number];

export interface Maquina {
  id: string;
  /** `MQ-L2-02` */
  codigo: string;
  nombre: string;
  /** `Envolvedora`, `Dosificadora`, `Túnel de frío`, … */
  tipo: string;
  lineaId: string;
  estado: EstadoMaquina;
  /** Nº de paradas registradas en los últimos 30 días. */
  paradas30d: number;
}

export const maquinaSchema = z.object({
  codigo: z
    .string()
    .min(1, 'El código es obligatorio')
    .regex(/^MQ-[A-Z0-9]+-\d{2}$/, 'Formato esperado MQ-L2-02'),
  nombre: z.string().min(3, 'El nombre es obligatorio'),
  tipo: z.string().min(3, 'El tipo es obligatorio'),
  lineaId: z.string().min(1, 'Selecciona una línea'),
  estado: z.enum(ESTADOS_MAQUINA).default('operativa'),
});
export type MaquinaInput = z.infer<typeof maquinaSchema>;

/* ------------------------------------------------------------------ */
/* Causas de parada (árbol Tipo → General → Específica)                */
/* ------------------------------------------------------------------ */

export const NIVELES_CAUSA = ['tipo', 'general', 'especifica'] as const;
export type NivelCausa = (typeof NIVELES_CAUSA)[number];

export interface CausaParada {
  id: string;
  /** `PM-01` (tipo) · `PM-01-03` (específica). */
  codigo: string;
  nombre: string;
  nivel: NivelCausa;
  /** Id del nodo padre; `null` en los 7 tipos raíz. */
  parentId: string | null;
  /** `programada` (CIP, cambio de producto) o `imprevista`. */
  clasificacion: 'programada' | 'imprevista';
  afectaOee: boolean;
  requiereEvidencia: boolean;
  requiereSolicitud: boolean;
  tiempoEstandarMin: number;
  /** Ids de líneas donde aplica; vacío = todas. */
  lineasAplicables: string[];
  estado: EstadoCatalogo;
  /** Nº de paradas históricas — se conservan aunque se elimine la causa. */
  paradasHistoricas: number;
}

/** Nodo del árbol devuelto por `GET /causas-parada?formato=arbol`. */
export interface CausaParadaNodo extends CausaParada {
  hijos: CausaParadaNodo[];
}

export const causaParadaSchema = z.object({
  codigo: z
    .string()
    .regex(/^P[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/, 'Formato esperado PM-01, PM-01-A o PM-01-03'),
  nombre: z.string().min(3, 'El nombre es obligatorio'),
  nivel: z.enum(NIVELES_CAUSA),
  parentId: z.string().nullable().default(null),
  clasificacion: z.enum(['programada', 'imprevista']).default('imprevista'),
  afectaOee: z.boolean().default(true),
  requiereEvidencia: z.boolean().default(false),
  requiereSolicitud: z.boolean().default(false),
  tiempoEstandarMin: z.coerce.number().min(0, 'Debe ser 0 o mayor').default(0),
  lineasAplicables: z.array(z.string()).default([]),
  estado: z.enum(['activo', 'inactivo'] as const).default('activo'),
});
export type CausaParadaInput = z.infer<typeof causaParadaSchema>;

/* ------------------------------------------------------------------ */
/* Causas de merma                                                     */
/* ------------------------------------------------------------------ */

export interface CausaMerma {
  id: string;
  /** `MR-01` … `MR-04` */
  codigo: string;
  nombre: string;
  /** Tipos de merma donde aplica. */
  aplicaA: TipoMermaCodigo[];
  requiereEvidencia: boolean;
  estado: EstadoCatalogo;
}

export const TIPOS_MERMA = ['MP', 'EP', 'PT'] as const;
export type TipoMermaCodigo = (typeof TIPOS_MERMA)[number];

export const TIPO_MERMA_LABEL: Record<TipoMermaCodigo, string> = {
  MP: 'Materia prima',
  EP: 'En proceso',
  PT: 'Producto terminado',
};

/* ------------------------------------------------------------------ */
/* Turnos                                                              */
/* ------------------------------------------------------------------ */

export interface TurnoDef extends TurnoInfo {
  id: string;
  codigo: Turno;
  activo: boolean;
}
