/**
 * Lector de órdenes SAP **pendientes** del sistema legado (`yamboli-back`,
 * Strapi 5 sobre PostgreSQL). Lo comparten la API (`OrdenesSapService`, en un
 * intervalo) y el script `pnpm sync:real`, para que los dos apliquen
 * exactamente el mismo filtro que el paso 1 «Seleccionar Orden» del wizard
 * legado:
 *
 *   - la fila no tiene enlace en `orden_fabricacion_dbs_orden_lnk` (nadie la
 *     ha ejecutado todavía: la ejecución vive en `orden_fabricacions`);
 *   - `tipo_produccion = 'Produccion'` (fuera pasteurización, reprocesos…);
 *   - `fecha >= ayer` en hora de Lima (el origen guarda fechas locales);
 *   - la línea no es la planta de pasteurización (`MIXPLANT 2`).
 *
 * Todo acceso es de **sólo lectura**: la conexión se abre con
 * `default_transaction_read_only=on` y la consulta corre además dentro de una
 * transacción `READ ONLY`, así que cualquier escritura accidental falla en el
 * propio servidor de origen.
 */
import { Client } from 'pg';
import type { Turno } from '@mes/types';

/** Fila cruda de `orden_fabricacion_dbs`, ya recortada y tipada. */
export interface FilaSapOrigen {
  /** `orden_fabricacion_dbs.id`: identifica la fila (el número SAP no es único). */
  sapId: number;
  numero: string;
  /** `YYYY-MM-DD` */
  fecha: string;
  /** `'1'` = Día · `'2'` = Noche */
  turno: string | null;
  codigoProducto: string | null;
  producto: string | null;
  lineaProduccion: string | null;
  /** Texto libre `'22800 u/h'` (a veces `' u/h'`). */
  velocidadEstandarTexto: string | null;
  /** Cajas, ya convertidas a entero (el origen las guarda como texto). */
  planificadoCajas: number;
  tipoProduccion: string | null;
}

/** Líneas del origen que no son líneas del MES (planta de pasteurización). */
export const LINEAS_PASTEURIZACION = ['MIXPLANT 2'];

/** Consulta compartida: filas pendientes de ejecutar, en el orden del wizard legado. */
export const SQL_ORDENES_SAP_PENDIENTES = `
  select
    d.id                                as "sapId",
    trim(d.orden_fabricacion)           as "numero",
    to_char(d.fecha,'YYYY-MM-DD')       as "fecha",
    nullif(trim(d.turno),'')            as "turno",
    nullif(trim(d.codigo_producto),'')  as "codigoProducto",
    nullif(trim(d.producto),'')         as "producto",
    nullif(trim(d.linea_produccion),'') as "lineaProduccion",
    d.velocidad_estandar                as "velocidadEstandarTexto",
    coalesce(nullif(regexp_replace(coalesce(d.planificado,''), '[^0-9]', '', 'g'),'')::int, 0) as "planificadoCajas",
    d.tipo_produccion                   as "tipoProduccion"
  from orden_fabricacion_dbs d
  where not exists (
          select 1 from orden_fabricacion_dbs_orden_lnk l
          where l.orden_fabricacion_db_id = d.id
        )
    and d.tipo_produccion = 'Produccion'
    and d.fecha >= (now() at time zone 'America/Lima')::date - 1
    and nullif(trim(d.orden_fabricacion),'') is not null
    and upper(trim(coalesce(d.linea_produccion,''))) <> all($1::text[])
  order by d.fecha, d.turno, d.id`;

/** Lo único que el lector necesita de un cliente `pg`. */
export type ConsultorPg = Pick<Client, 'query'>;

/** Lee las órdenes SAP pendientes con un cliente ya abierto (y ya en sólo lectura). */
export async function leerOrdenesSapPendientes(cliente: ConsultorPg): Promise<FilaSapOrigen[]> {
  const { rows } = await cliente.query(SQL_ORDENES_SAP_PENDIENTES, [LINEAS_PASTEURIZACION]);
  return rows as FilaSapOrigen[];
}

/**
 * Abre una conexión de **sólo lectura** al origen, ejecuta `trabajo` dentro de
 * una transacción `READ ONLY` y cierra siempre la conexión. El `rollback` final
 * es deliberado: no hay nada que confirmar.
 */
export async function conOrigenSoloLectura<T>(
  url: string,
  trabajo: (cliente: ConsultorPg) => Promise<T>,
  aplicacion = 'mes-ordenes-sap',
): Promise<T> {
  const cliente = new Client({
    connectionString: url,
    ssl: false,
    application_name: aplicacion,
    connectionTimeoutMillis: 10_000,
    /* Parámetros de sesión fijados en el arranque: la sesión nace read only. */
    options: '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000',
  });
  try {
    await cliente.connect();
    await cliente.query('begin transaction isolation level repeatable read read only');
    try {
      return await trabajo(cliente);
    } finally {
      await cliente.query('rollback').catch(() => undefined);
    }
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Traducción de valores SAP → MES (sin acceso a base de datos)        */
/* ------------------------------------------------------------------ */

/** Id estable de la fila en el MES: `SAP-<id de orden_fabricacion_dbs>`. */
export function idOrdenSap(sapId: number): string {
  return `SAP-${sapId}`;
}

/** Prefijo de las filas que vienen del origen (las de demostración usan `SAPD-`). */
export const PREFIJO_ORDEN_SAP = 'SAP-';

/** SAP codifica el turno como `'1'` (Día) / `'2'` (Noche). */
export function turnoDesdeSap(turno: string | null | undefined): Turno {
  return turno?.trim() === '2' ? 'N' : 'D';
}

/** `'22800 u/h'` → `22800`; `' u/h'`, `'0 u/h'` o vacío → `null`. */
export function velocidadSapUnidHora(texto: string | null | undefined): number | null {
  const digitos = (texto ?? '').replace(/[^0-9]/g, '');
  const valor = digitos ? Number(digitos) : 0;
  return valor > 0 ? valor : null;
}

/** Mayúsculas sin tildes ni espacios repetidos: `Moldeadora A4` ≡ `MOLDEADORA  A4`. */
export function normalizarNombreLinea(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
