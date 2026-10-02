import { z } from 'zod';
import {
  ESTADOS_CATALOGO,
  TIPOS_PROCESO_LINEA,
} from './common';
import type { EstadoCatalogo, TipoProcesoLinea, Turno, TurnoInfo } from './common';

/* ------------------------------------------------------------------ */
/* Helpers de formulario compartidos por los mantenedores              */
/* ------------------------------------------------------------------ */

/**
 * Número obligatorio de formulario: `''`, `null` o texto no numérico dan
 * `mensaje` en español (antes `z.coerce` convertía `''` en 0 en silencio o
 * mostraba «Expected number, received nan»). Acepta coma decimal.
 */
export function numeroRequerido(mensaje = 'Ingresa un número') {
  return z.preprocess(
    (v) => {
      if (v === '' || v === null || v === undefined) return Number.NaN;
      if (typeof v === 'string') return Number(v.trim().replace(',', '.'));
      return v;
    },
    z.number({ invalid_type_error: mensaje, required_error: mensaje }).finite(mensaje),
  );
}

/**
 * Número opcional desde un input: `''`, `null` o espacios quedan en `null`
 * (`z.coerce.number()` los convertía en 0, que es un valor distinto de «sin dato»).
 */
export function numeroOpcional(mensaje = 'Ingresa un número') {
  return z.preprocess(
    (v) => {
      if (v === '' || v === null || v === undefined) return null;
      if (typeof v === 'string') {
        const t = v.trim();
        return t === '' ? null : Number(t.replace(',', '.'));
      }
      return v;
    },
    z.number({ invalid_type_error: mensaje }).finite(mensaje).nullable(),
  );
}

/** Texto obligatorio sin espacios sobrantes: `'   '` ya no pasa `min(n)`. */
export function textoRequerido(min: number, mensaje: string) {
  return z.string({ required_error: mensaje }).trim().min(min, mensaje);
}

/**
 * Versión leída del registro, para el control de concurrencia optimista: la API
 * responde 409 si otra persona lo guardó después. Opcional por compatibilidad.
 */
const versionLeida = z.number().int().positive().optional();

/** Mensaje del 409 de concurrencia optimista (lo comparten API y web). */
export const MENSAJE_CONFLICTO_VERSION =
  'Otra persona modificó este registro mientras lo editabas. Recarga para ver los cambios y vuelve a intentarlo.';

/** Capacidad nominal máxima admitida para una línea (u/min). */
export const CAPACIDAD_LINEA_MAX = 100_000;

/* ------------------------------------------------------------------ */
/* Líneas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Línea de producción = máquina física del sistema original (9 reales).
 *
 * @example
 * {
 *   id: 'LIN-LLEN-M2', codigo: 'LLEN-M2', nombre: 'Llenadora M2',
 *   nombreCorto: 'LLEN M2', tipoProceso: 'llenadora',
 *   estado: 'activo', capacidadUnidadesMin: 133.3, paradas30d: 4
 * }
 */
export interface Linea {
  id: string;
  /** `LLEN-M2`, `EXTR-2`, `MOLD-A3`. */
  codigo: string;
  /** `Llenadora M2`, `Extrusora 2`, `Moldeadora A3`. */
  nombre: string;
  /** Etiqueta compacta para LineCard y modo TV: `LLEN M2`. */
  nombreCorto: string;
  tipoProceso: TipoProcesoLinea;
  estado: EstadoCatalogo;
  /**
   * Capacidad nominal en unidades por minuto, capturada en el mantenedor. El
   * OEE usa la velocidad del par producto × línea, no este valor.
   */
  capacidadUnidadesMin: number;
  /** Versión para la concurrencia optimista (sube en cada edición). */
  version?: number;
}

/** Fila del mantenedor de líneas con los contadores ya resueltos. */
export interface LineaListItem extends Linea {
  /** Nº de pares producto × línea activos del mantenedor de velocidades. */
  productosConVelocidad: number;
  /** Nº de paradas registradas en los últimos 30 días. */
  paradas30d: number;
}

/** Alta/edición de línea (`POST /lineas`, `PATCH /lineas/:id`). */
export const lineaSchema = z.object({
  /** Inmutable tras el alta: el id `LIN-<codigo>` lo referencian órdenes y paradas. */
  codigo: z
    .string()
    .trim()
    .regex(/^[A-Z]{3,4}-[A-Z]?\d{1,2}$/, 'Formato esperado LLEN-M2, EXTR-2 o MOLD-A3'),
  nombre: textoRequerido(3, 'El nombre es obligatorio'),
  nombreCorto: textoRequerido(2, 'El nombre corto es obligatorio'),
  tipoProceso: z.enum(TIPOS_PROCESO_LINEA, {
    errorMap: () => ({ message: 'Selecciona el tipo de proceso' }),
  }),
  estado: z.enum(ESTADOS_CATALOGO).default('activo'),
  capacidadUnidadesMin: numeroRequerido('Ingresa la capacidad (0 si no aplica)')
    .pipe(
      z
        .number()
        .min(0, 'Debe ser 0 o mayor')
        .max(CAPACIDAD_LINEA_MAX, `Máximo ${CAPACIDAD_LINEA_MAX.toLocaleString('es-PE')} u/min`),
    )
    .default(0),
  version: versionLeida,
});
export type LineaInput = z.infer<typeof lineaSchema>;

/** Edición parcial (`PATCH /lineas/:id`); el código no se edita. */
export const updateLineaSchema = lineaSchema.omit({ codigo: true }).partial();
export type UpdateLineaInput = z.infer<typeof updateLineaSchema>;

/* ------------------------------------------------------------------ */
/* Sabores                                                             */
/* ------------------------------------------------------------------ */

/**
 * Catálogo de sabores del sistema original (41 reales, sin FK con producto).
 *
 * @example { id: 'SAB-2110124', codigo: '2110124', nombre: 'Capuccino', estado: 'activo' }
 */
export interface Sabor {
  id: string;
  /** Código de 7 dígitos del maestro original. */
  codigo: string;
  nombre: string;
  estado: EstadoCatalogo;
}

export const saborSchema = z.object({
  codigo: z.string().regex(/^\d{7}$/, 'Formato esperado 2110124 (7 dígitos)'),
  nombre: z.string().min(3, 'El nombre es obligatorio'),
  estado: z.enum(ESTADOS_CATALOGO).default('activo'),
});
export type SaborInput = z.infer<typeof saborSchema>;

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

/**
 * Producto terminado del maestro real (código de 7 dígitos).
 *
 * No lleva `lineaId` ni `velocidadEstandar`: la velocidad vive en el par
 * producto × línea ({@link VelocidadEstandar}).
 *
 * @example
 * {
 *   id: 'PRD-1110001', codigo: '1110001',
 *   descripcionLarga: 'CUBETA YAMBOLY HELADO CREMA CAPUCCINO 1 X 5 L',
 *   descripcionCorta: 'CUB-YAM-CAPUCCINO 1X5L', nombre: 'CUB-YAM-CAPUCCINO 1X5L',
 *   alias: null, marca: 'YAMBOLY', presentacion: '2.54 kg(5L)',
 *   unidadesPorCaja: 1, pesoKg: 2.54, saborId: 'SAB-2110124', sabor: 'Capuccino',
 *   estado: 'activo'
 * }
 */
export interface Producto {
  id: string;
  /** 7 dígitos: `1110001`. */
  codigo: string;
  /** Descripción comercial completa del maestro. */
  descripcionLarga: string;
  /** Descripción abreviada usada en tablas y tickets. */
  descripcionCorta: string;
  /** Nombre mostrado en la UI (= `descripcionCorta`). */
  nombre: string;
  /** Alias interno de planta; `null` en la mayoría de productos. */
  alias?: string | null;
  /** `YAMBOLY`, `DONOFRIO`, … */
  marca?: string | null;
  /** Presentación comercial: `2.54 kg(5L)`, `120 ml`, … */
  presentacion?: string | null;
  unidadesPorCaja: number;
  /** Peso neto por unidad en kilogramos. */
  pesoKg: number;
  /** Id del {@link Sabor}; `null` cuando la heurística del maestro no lo resolvió. */
  saborId?: string | null;
  /** Nombre del sabor (informativo, derivado del maestro): `Capuccino`. */
  sabor: string;
  estado: EstadoCatalogo;
  /** Versión para la concurrencia optimista (sube en cada edición). */
  version?: number;
}

export const productoSchema = z.object({
  /** Inmutable tras el alta: el id `PRD-<codigo>` lo referencian las órdenes. */
  codigo: z.string().trim().regex(/^\d{7}$/, 'Formato esperado 1110001 (7 dígitos)'),
  descripcionLarga: textoRequerido(3, 'La descripción larga es obligatoria'),
  descripcionCorta: textoRequerido(3, 'La descripción corta es obligatoria'),
  nombre: textoRequerido(3, 'El nombre es obligatorio'),
  alias: z.string().nullable().default(null),
  marca: z.string().nullable().default(null),
  presentacion: z.string().nullable().default(null),
  unidadesPorCaja: numeroRequerido('Ingresa las unidades por caja')
    .pipe(z.number().int('Debe ser un número entero').min(1, 'Debe ser 1 o mayor'))
    .default(1),
  pesoKg: numeroRequerido('Ingresa el peso').pipe(
    z.number().positive('El peso debe ser mayor que 0').max(10_000, 'Peso fuera de rango'),
  ),
  saborId: z.string().nullable().default(null),
  /**
   * Texto derivado del maestro; queda vacío en los productos cuya heurística de
   * sabor no resolvió (`saborId: null`), por eso no es obligatorio. La relación
   * real es `saborId` contra `GET /sabores`.
   */
  sabor: z.string().default(''),
  estado: z.enum(ESTADOS_CATALOGO).default('activo'),
  version: versionLeida,
});
export type ProductoInput = z.infer<typeof productoSchema>;

/** Edición parcial (`PATCH /productos/:id`); el código no se edita. */
export const updateProductoSchema = productoSchema.omit({ codigo: true }).partial();
export type UpdateProductoInput = z.infer<typeof updateProductoSchema>;

/* ------------------------------------------------------------------ */
/* Velocidad estándar (par producto × línea)                           */
/* ------------------------------------------------------------------ */

/**
 * Velocidad estándar del par producto × línea (tabla `producto_linea`, 340 pares).
 * Unicidad por `(productoId, lineaId)`.
 *
 * `velocidadUnidHora` es el dato fuente del maestro (360–29 000 u/h);
 * `velocidadUnidMin = velocidadUnidHora / 60` redondeado a **1 decimal** y es
 * la magnitud que consume el cálculo de OEE (desempeño) y la que se **congela**
 * en `OrdenFabricacion.velocidadEstandar` al iniciar la orden.
 *
 * @example
 * {
 *   id: 'VE-0002', productoId: 'PRD-1110001', lineaId: 'LIN-LLEN-M2',
 *   velocidadUnidHora: 480, velocidadUnidMin: 8, mermaEstandarPct: 0.9,
 *   cipMin: null, arranqueMin: null, estado: 'activo'
 * }
 */
export interface VelocidadEstandar {
  id: string;
  productoId: string;
  lineaId: string;
  /** Dato fuente del maestro, en unidades por **hora**. */
  velocidadUnidHora: number;
  /** Derivado: `velocidadUnidHora / 60` con 1 decimal. Es el que consume el OEE. */
  velocidadUnidMin: number;
  /** Merma estándar admitida para el par, en porcentaje (0–100). */
  mermaEstandarPct: number;
  /** Minutos de CIP del par; `null` si el maestro no lo define. */
  cipMin: number | null;
  /** Minutos de arranque del par; `null` si el maestro no lo define. */
  arranqueMin: number | null;
  estado: EstadoCatalogo;
  /** Versión para la concurrencia optimista (sube en cada edición). */
  version?: number;
}

/** Fila de la matriz producto × línea con los textos ya resueltos. */
export interface VelocidadEstandarListItem extends VelocidadEstandar {
  productoCodigo: string;
  productoNombre: string;
  lineaCodigo: string;
  lineaNombre: string;
  tipoProceso: TipoProcesoLinea;
}

export const velocidadEstandarSchema = z.object({
  productoId: z.string().min(1, 'Selecciona un producto'),
  lineaId: z.string().min(1, 'Selecciona una línea'),
  velocidadUnidHora: numeroRequerido('Ingresa la velocidad en u/h').pipe(
    z
      .number()
      .int('Debe ser un número entero')
      .min(1, 'Debe ser mayor que 0')
      .max(60_000, 'Velocidad fuera de rango'),
  ),
  mermaEstandarPct: numeroRequerido('Ingresa la merma (0 si no aplica)')
    .pipe(z.number().min(0, 'Debe ser 0 o mayor').max(100, 'No puede superar 100 %'))
    .default(0),
  cipMin: numeroOpcional()
    .pipe(z.number().min(0, 'Debe ser 0 o mayor').nullable())
    .default(null),
  arranqueMin: numeroOpcional()
    .pipe(z.number().min(0, 'Debe ser 0 o mayor').nullable())
    .default(null),
  estado: z.enum(ESTADOS_CATALOGO).default('activo'),
  version: versionLeida,
});
export type VelocidadEstandarInput = z.infer<typeof velocidadEstandarSchema>;

/** Edición parcial (`PATCH /velocidades-estandar/:id`). */
export const updateVelocidadEstandarSchema = velocidadEstandarSchema.partial();
export type UpdateVelocidadEstandarInput = z.infer<typeof updateVelocidadEstandarSchema>;

/* ------------------------------------------------------------------ */
/* Árbol de causas (base compartida parada / merma)                    */
/* ------------------------------------------------------------------ */

/**
 * Contrato mínimo que cumplen `CausaParada` y `CausaMerma`, para que el árbol
 * de la UI (`CausasTree`) y sus modales sean genéricos sobre ambos catálogos.
 */
export interface NodoCausaBase {
  id: string;
  codigo: string;
  nombre: string;
  /** `tipo` | `general` | `especifica` (parada) · `tipo` | `clasificacion` | `causa` (merma). */
  nivel: string;
  /** Id del nodo padre; `null` en las raíces. */
  parentId: string | null;
  estado: EstadoCatalogo;
  /** Versión para la concurrencia optimista (sube en cada edición). */
  version?: number;
}

/* ------------------------------------------------------------------ */
/* Causas de parada (árbol Tipo → General → Específica)                */
/* ------------------------------------------------------------------ */

export const NIVELES_CAUSA = ['tipo', 'general', 'especifica'] as const;
export type NivelCausa = (typeof NIVELES_CAUSA)[number];

/**
 * Causa de parada del maestro real (5 tipos → 23 generales → 52 específicas).
 *
 * @example
 * { id: 'CPA-PN-02-01', codigo: 'PN-02-01', nombre: 'Falla mantto',
 *   nivel: 'especifica', parentId: 'CPA-PN-02-A', clasificacion: 'imprevista',
 *   afectaOee: true, codigoLegado: 'FAL02', estado: 'activo' }
 */
export interface CausaParada {
  id: string;
  /** `PP-01` (tipo) · `PP-01-A` (general) · `PP-01-01` (específica). */
  codigo: string;
  nombre: string;
  nivel: NivelCausa;
  /** Id del nodo padre; `null` en los tipos raíz (`PP-01`, `PN-02`, `PN-03`, `PN-04`, `PS-05`). */
  parentId: string | null;
  /**
   * `programada` (CIP, cambio de producto) o `imprevista`. Se hereda del tipo
   * raíz: sólo se edita en el tipo y se propaga a su subárbol.
   */
  clasificacion: 'programada' | 'imprevista';
  afectaOee: boolean;
  requiereEvidencia: boolean;
  requiereSolicitud: boolean;
  tiempoEstandarMin: number;
  /** Ids de líneas donde aplica; vacío = todas. */
  lineasAplicables: string[];
  estado: EstadoCatalogo;
  /**
   * Nº de paradas registradas con esta causa, calculado al consultar (paradas
   * con `causaId` + el histórico heredado del maestro). Se conservan aunque se
   * dé de baja la causa.
   */
  paradasHistoricas: number;
  /** Código del sistema original (`PNP`, `RUT04`, `FAL02`, `IMP10`); `null` si no existía. */
  codigoLegado?: string | null;
  /** Versión para la concurrencia optimista (sube en cada edición). */
  version?: number;
}

/** Nodo del árbol devuelto por `GET /causas-parada?formato=arbol`. */
export interface CausaParadaNodo extends CausaParada {
  hijos: CausaParadaNodo[];
}

export const causaParadaSchema = z.object({
  /** Inmutable tras el alta: el id `CPA-<codigo>` lo referencian las paradas. */
  codigo: z
    .string()
    .trim()
    .regex(/^P[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/, 'Formato esperado PP-01, PP-01-A o PP-01-01'),
  nombre: textoRequerido(3, 'El nombre es obligatorio'),
  nivel: z.enum(NIVELES_CAUSA),
  parentId: z.string().nullable().default(null),
  clasificacion: z.enum(['programada', 'imprevista']).default('imprevista'),
  afectaOee: z.boolean().default(true),
  requiereEvidencia: z.boolean().default(false),
  requiereSolicitud: z.boolean().default(false),
  tiempoEstandarMin: numeroRequerido('Ingresa los minutos (0 si no aplica)')
    .pipe(z.number().int('Debe ser un número entero de minutos').min(0, 'Debe ser 0 o mayor'))
    .default(0),
  lineasAplicables: z.array(z.string()).default([]),
  estado: z.enum(ESTADOS_CATALOGO).default('activo'),
  /** Código del sistema original; opcional y anulable. */
  codigoLegado: z.string().nullable().optional(),
  version: versionLeida,
});
export type CausaParadaInput = z.infer<typeof causaParadaSchema>;

/**
 * Edición (`PATCH /causas-parada/:id`): código, nivel y padre son inmutables
 * (definen el id y la posición en el árbol); `clasificacion` sólo se acepta en
 * un tipo raíz y se propaga a su subárbol.
 */
export const updateCausaParadaSchema = causaParadaSchema
  .omit({ codigo: true, nivel: true, parentId: true })
  .partial();
export type UpdateCausaParadaInput = z.infer<typeof updateCausaParadaSchema>;

/* ------------------------------------------------------------------ */
/* Causas de merma (árbol Tipo → Clasificación → Causa)                */
/* ------------------------------------------------------------------ */

export const TIPOS_MERMA = ['MP', 'EP', 'PT'] as const;
export type TipoMermaCodigo = (typeof TIPOS_MERMA)[number];

export const TIPO_MERMA_LABEL: Record<TipoMermaCodigo, string> = {
  MP: 'Materia prima',
  EP: 'En proceso',
  PT: 'Producto terminado',
};

export const NIVELES_CAUSA_MERMA = ['tipo', 'clasificacion', 'causa'] as const;
export type NivelCausaMerma = (typeof NIVELES_CAUSA_MERMA)[number];

export const NIVEL_CAUSA_MERMA_LABEL: Record<NivelCausaMerma, string> = {
  tipo: 'Tipo de producción',
  clasificacion: 'Clasificación',
  causa: 'Causa',
};

/**
 * Causa de merma del maestro real, con el mismo patrón de árbol de 3 niveles
 * que las causas de parada (tipo → clasificación → causa).
 *
 * @example
 * { id: 'CME-MP-01-01', codigo: 'MP-01-01', nombre: 'Derrame de mezcla',
 *   nivel: 'causa', parentId: 'CME-MP-01-A', aplicaA: ['MP', 'EP', 'PT'],
 *   requiereComentario: true, requiereSolicitud: false, estado: 'activo' }
 */
export interface CausaMerma {
  id: string;
  /** `MP-01` (tipo) · `MP-01-A` (clasificación) · `MP-01-01` (causa). */
  codigo: string;
  nombre: string;
  nivel: NivelCausaMerma;
  /** Id del nodo padre; `null` en los tipos raíz (`MP-01` … `MP-05`). */
  parentId: string | null;
  /** Tipos de merma donde aplica. */
  aplicaA: TipoMermaCodigo[];
  /** Ids de líneas donde aplica; vacío = todas. */
  lineasAplicables: string[];
  requiereEvidencia: boolean;
  /** Obliga a `observacion` en el wizard de merma. */
  requiereComentario: boolean;
  /** Obliga a `numeroSolicitud` en el wizard de merma. */
  requiereSolicitud: boolean;
  estado: EstadoCatalogo;
  /**
   * Nº de mermas registradas con esta causa, calculado al consultar (mermas
   * con `causaId` + el histórico heredado del maestro).
   */
  mermasHistoricas: number;
  /** Versión para la concurrencia optimista (sube en cada edición). */
  version?: number;
}

/** Nodo del árbol devuelto por `GET /causas-merma?formato=arbol`. */
export interface CausaMermaNodo extends CausaMerma {
  hijos: CausaMermaNodo[];
}

export const causaMermaSchema = z.object({
  /** Inmutable tras el alta: el id `CME-<codigo>` lo referencian las mermas. */
  codigo: z
    .string()
    .trim()
    .regex(/^M[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/, 'Formato esperado MP-01, MP-01-A o MP-01-01'),
  nombre: textoRequerido(3, 'El nombre es obligatorio'),
  nivel: z.enum(NIVELES_CAUSA_MERMA),
  parentId: z.string().nullable().default(null),
  aplicaA: z.array(z.enum(TIPOS_MERMA)).default([]),
  lineasAplicables: z.array(z.string()).default([]),
  requiereEvidencia: z.boolean().default(false),
  requiereComentario: z.boolean().default(false),
  requiereSolicitud: z.boolean().default(false),
  estado: z.enum(ESTADOS_CATALOGO).default('activo'),
  version: versionLeida,
});
export type CausaMermaInput = z.infer<typeof causaMermaSchema>;

/** Edición (`PATCH /causas-merma/:id`): código, nivel y padre son inmutables. */
export const updateCausaMermaSchema = causaMermaSchema
  .omit({ codigo: true, nivel: true, parentId: true })
  .partial();
export type UpdateCausaMermaInput = z.infer<typeof updateCausaMermaSchema>;

/* ------------------------------------------------------------------ */
/* Turnos                                                              */
/* ------------------------------------------------------------------ */

export interface TurnoDef extends TurnoInfo {
  id: string;
  codigo: Turno;
  activo: boolean;
}
