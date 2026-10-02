import { z } from 'zod';
import { TIEMPO_REGISTRO_MAX_SEG, TURNOS } from './common';
import type { PaginationQuery, Periodo, Role, Turno } from './common';

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
  /**
   * Número de OF: el número SAP (`95101752`, con sufijo `-2`, `-3`… cuando el
   * mismo número se ejecuta más de una vez) o `OF-2026-0815` en los datos
   * sembrados anteriores a la integración con SAP.
   */
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
  /**
   * Velocidad estándar **en unidades por minuto**, congelada al iniciar la orden
   * a partir del par producto × línea vigente (`VelocidadEstandar.velocidadUnidMin`,
   * = `velocidadUnidHora / 60` con 1 decimal). No cambia si luego se edita el par.
   */
  velocidadEstandar: number;
  /**
   * Par producto × línea del que se copió `velocidadEstandar` (`VE-0002`);
   * `null` en órdenes anteriores a la migración de maestros.
   */
  velocidadEstandarId?: string | null;
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
  /** Foto de la etiqueta adjuntada al finalizar la orden. */
  evidenciaUrl?: string | null;
}

/**
 * Plan SAP del que nació la orden. El turno de la orden es el de su hora real
 * de inicio; el del plan SAP se conserva aquí como dato del plan.
 */
export interface PlanSapDeOrden {
  ordenSapId: string;
  numero: string;
  /** ISO `YYYY-MM-DD` del plan SAP. */
  fecha: string;
  turno: Turno;
  planificadoCajas: number;
}

/** Fila de listado con los textos ya resueltos (línea, producto, personas). */
export interface OrdenListItem extends OrdenFabricacion {
  lineaCodigo: string;
  lineaNombre: string;
  productoNombre: string;
  maquinistaNombre: string;
  supervisorNombre: string;
  /** Sólo en el detalle (`GET /ordenes/:id`) de órdenes nacidas de SAP. */
  planSap?: PlanSapDeOrden | null;
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
  /**
   * Última sincronización real con SAP (máximo `sincronizadaEn` de las órdenes
   * SAP); `null` si nunca se sincronizó.
   */
  ultimaSincronizacion: string | null;
}

/* ------------------------------------------------------------------ */
/* Mutaciones                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Límites                                                             */
/* ------------------------------------------------------------------ */

/** Longitud máxima del lote (`L-AAMMDD-NN` y variantes de planta). */
export const LOTE_MAX = 40;
/** Operarios por turno: tope razonable (y muy por debajo de int4). */
export const OPERARIOS_MAX = 200;
/** Unidades declaradas al cerrar una orden: tope muy por debajo de int4 (2 147 483 647). */
export const UNIDADES_MAX = 100_000_000;

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `true` si `YYYY-MM-DD` es una fecha de calendario real (`2026-13-45` no lo es). */
export function esFechaReal(valor: string): boolean {
  if (!FECHA_ISO.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Número entero obligatorio desde un input: `''`, `null` o espacios **no** se
 * convierten en 0 (como hacía `z.coerce.number()`), y los mensajes van en español.
 */
function enteroObligatorio(opciones: { min: number; max: number; minMensaje: string; maxMensaje: string }) {
  return z.preprocess(
    (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string') {
        const t = v.trim();
        return t === '' ? undefined : Number(t.replace(',', '.'));
      }
      return v;
    },
    z
      .number({ required_error: 'Campo obligatorio', invalid_type_error: 'Debe ser un número' })
      .int('Debe ser un número entero')
      .min(opciones.min, opciones.minMensaje)
      .max(opciones.max, opciones.maxMensaje),
  );
}

const tiempoRegistroSeg = z.coerce
  .number()
  .int()
  .min(0)
  .max(TIEMPO_REGISTRO_MAX_SEG)
  .default(0);

/**
 * Alta de una orden **a partir de una orden SAP pendiente** (como el wizard del
 * sistema legado). Línea, producto, número de OF (= número SAP), planificado
 * (cajas × unidades por caja) y velocidad estándar los deriva el servidor de la
 * fila SAP; el turno es el de la hora real de inicio. El formulario sólo aporta
 * lo que SAP no sabe.
 */
export const createOrdenSchema = z.object({
  ordenSapId: z.string().min(1, 'Selecciona una orden SAP'),
  lote: z
    .string()
    .trim()
    .min(3, 'El lote es obligatorio (mínimo 3 caracteres)')
    .max(LOTE_MAX, `Máximo ${LOTE_MAX} caracteres`),
  /** Fecha real y posterior a hoy (el servidor lo vuelve a comprobar en hora de planta). */
  vencimiento: z
    .string()
    .refine(esFechaReal, 'Fecha inválida')
    .refine((v) => v > hoyNavegador(), 'El vencimiento debe ser posterior a hoy'),
  maquinistaId: z.string().min(1, 'Selecciona un maquinista'),
  supervisorId: z.string().min(1, 'Selecciona un supervisor'),
  operarios: enteroObligatorio({
    min: 1,
    max: OPERARIOS_MAX,
    minMensaje: 'Debe haber al menos 1 operario',
    maxMensaje: `Máximo ${OPERARIOS_MAX} operarios`,
  }),
  colaboradorIds: z.array(z.string()).default([]),
  /** Cronómetro del wizard: alimenta el postest del TRI (Anexo 02). */
  tiempoRegistroSeg,
});
export type CreateOrdenInput = z.infer<typeof createOrdenSchema>;
export type CreateOrden = CreateOrdenInput;

/** `YYYY-MM-DD` local del cliente (el servidor valida en hora de planta). */
function hoyNavegador(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const finalizeOrdenSchema = z.object({
  producido: enteroObligatorio({
    min: 0,
    max: UNIDADES_MAX,
    minMensaje: 'Debe ser 0 o mayor',
    maxMensaje: 'Cantidad fuera de rango',
  }),
  conteoCodificadora: enteroObligatorio({
    min: 0,
    max: UNIDADES_MAX,
    minMensaje: 'Debe ser 0 o mayor',
    maxMensaje: 'Cantidad fuera de rango',
  }),
  evidenciaUrl: z.string().optional(),
  comentario: z.string().max(500, 'Máximo 500 caracteres').optional(),
  /** Cronómetro del modal de cierre: alimenta el postest del TRI (Anexo 02). */
  tiempoRegistroSeg,
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
  observacion: z.string().max(500, 'Máximo 500 caracteres').optional(),
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

/* ------------------------------------------------------------------ */
/* Permisos (mismos que los `@Roles` del controlador)                  */
/* ------------------------------------------------------------------ */

type UsuarioConRol = { rol: Role; lineaId?: string | null } | null | undefined;

/** Iniciar una orden (`POST /ordenes`) y sincronizar con SAP. */
export const ROLES_INICIAR_ORDEN: readonly Role[] = ['jefe', 'supervisor'];
/** Finalizar una orden: el maquinista sólo en su línea. */
export const ROLES_FINALIZAR_ORDEN: readonly Role[] = ['jefe', 'supervisor', 'maquinista'];
/** Validar y sellar una orden (RF5). */
export const ROLES_VALIDAR_ORDEN: readonly Role[] = ['jefe', 'supervisor'];

export function puedeIniciarOrden(usuario: UsuarioConRol): boolean {
  return Boolean(usuario && ROLES_INICIAR_ORDEN.includes(usuario.rol));
}

export function puedeFinalizarOrden(usuario: UsuarioConRol, lineaId: string): boolean {
  if (!usuario || !ROLES_FINALIZAR_ORDEN.includes(usuario.rol)) return false;
  if (usuario.rol === 'maquinista') return Boolean(usuario.lineaId) && usuario.lineaId === lineaId;
  return true;
}

export function puedeValidarOrden(usuario: UsuarioConRol): boolean {
  return Boolean(usuario && ROLES_VALIDAR_ORDEN.includes(usuario.rol));
}
