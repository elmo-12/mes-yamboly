import type { Turno } from './common';

/**
 * Orden SAP planificada (cabecera `orden_fabricacion_dbs` del sistema legado,
 * que inserta el integrador de SAP). Es la **materia prima** de una orden de
 * fabricación del MES: el wizard «Iniciar orden» elige una fila pendiente y el
 * servidor deriva de ella línea, producto, turno, número y planificado.
 *
 * El número SAP **no es único**: el mismo número reaparece en otra fecha, turno
 * o línea (y en los parciales). Lo que se consume una sola vez es la **fila**
 * (`id`).
 */
export interface OrdenSap {
  /** `SAP-<id de la fila de origen>`; `SAPD-…` en los datos de demostración. */
  id: string;
  /** Número de OF en SAP (`95101752`). Puede repetirse entre filas. */
  numero: string;
  /** ISO `YYYY-MM-DD` del plan SAP. */
  fecha: string;
  /** `D` (SAP `'1'`) · `N` (SAP `'2'`). */
  turno: Turno;
  lineaId: string;
  /** `null` si el código SAP no existe en el maestro del MES (no seleccionable). */
  productoId: string | null;
  /** Código SAP del producto (7 dígitos). */
  codigoProducto: string;
  /** Descripción del producto tal como llega de SAP. */
  productoNombre: string;
  /** Cantidad planificada en **cajas** (SAP planifica en cajas). */
  planificadoCajas: number;
  /** Velocidad estándar del texto SAP (`'22800 u/h'`) en u/h; `null` si viene vacía. */
  velocidadUnidHora: number | null;
  tipoProduccion: string | null;
  /** Orden de fabricación del MES que consumió la fila; `null` = pendiente. */
  ordenId: string | null;
  /** ISO-8601 de la última sincronización que trajo o refrescó la fila. */
  sincronizadaEn: string;
}

/** Fila del selector del wizard, con línea y cantidades ya resueltas. */
export interface OrdenSapListItem extends OrdenSap {
  lineaCodigo: string;
  lineaNombre: string;
  unidadesPorCaja: number;
  /** `planificadoCajas × unidadesPorCaja`: lo que guardará la orden del MES. */
  planificadoUnidades: number;
  /**
   * Velocidad estándar con la que se iniciaría la orden, en **u/min**: la del
   * par producto × línea activo y, si no lo hay, la del texto SAP. `null` si no
   * hay ninguna (la orden no podría iniciarse: 422).
   */
  velocidadEstandar: number | null;
  /** De dónde sale `velocidadEstandar`. */
  velocidadFuente: 'par' | 'sap' | null;
}

export interface OrdenSapQuery {
  lineaId?: string;
  /** Busca por número de orden, código o descripción del producto. */
  q?: string;
}

/** Respuesta de `POST /ordenes-sap/sincronizar`. */
export interface SincronizacionOrdenesSap {
  /** Filas pendientes leídas del origen. */
  leidas: number;
  insertadas: number;
  actualizadas: number;
  /** Pendientes que desaparecieron del origen o ya se consumieron allí. */
  eliminadas: number;
  /** Filas descartadas por línea desconocida. */
  omitidas: number;
  /** Filas guardadas sin producto mapeado (no se listan). */
  sinProducto: number;
  sincronizadaEn: string;
}
