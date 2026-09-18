/**
 * Lectura del sistema **real** de planta: `yamboli-back` (Strapi 5 sobre la base
 * PostgreSQL `sitemaster`). Este módulo sólo **lee**: abre un `Client` de `pg`,
 * ejecuta cinco consultas bajo un único snapshot consistente y devuelve filas
 * planas. Nunca escribe en el origen.
 *
 * Convenciones del origen descubiertas al mapear el esquema (importantes, porque
 * no están documentadas en Strapi):
 *
 * - Los campos de negocio con hora (`hora_inicio`, `hora_fin`, `hora`) son
 *   `timestamp without time zone` y guardan **hora local de Lima**, no UTC. Se
 *   formatean tal cual con `to_char`.
 * - `created_at` / `updated_at` los gestiona Strapi y sí van en **UTC**: para
 *   compararlos con los anteriores hay que pasarlos por
 *   `at time zone 'UTC' at time zone 'America/Lima'`.
 * - `orden_fabricacion_dbs` es la cabecera de la OF que llega de SAP (fecha,
 *   turno, línea, producto, planificado); `orden_fabricacions` es el registro de
 *   **ejecución** que abre el maquinista. Una OF planificada que nunca se inició
 *   no tiene fila de ejecución.
 * - `planificado`, `total_producido` y `cantidad_codificadora` están en
 *   **cajas**; `velocidad_estandar` es un texto tipo `"27000 u/h"` en
 *   **unidades por hora**. Las unidades se obtienen multiplicando por
 *   `productos.unidades` (unidades por caja).
 * - La línea `MIXPLANT 2` es la planta de pasteurización: no es una de las 9
 *   líneas del MES y se descarta en el mapeo, no aquí.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

/** Cabecera de OF + registro de ejecución, ya resueltos en una sola fila. */
export interface OrdenOrigen {
  ofId: number;
  codigo: string;
  fecha: string;
  turno: string | null;
  codigoProducto: string | null;
  producto: string | null;
  lineaProduccion: string | null;
  velocidadEstandarTexto: string | null;
  planificadoCajas: number;
  tipoProduccion: string | null;
  maquinista: string | null;
  supervisor: string | null;
  numeroOperarios: number | null;
  comentarios: string | null;
  inicio: string | null;
  fin: string | null;
  totalProducidoCajas: number | null;
  totalCodificadoraCajas: number | null;
  maxCodificadoraCajas: number | null;
  disponibilidad: number | null;
  rendimiento: number | null;
  calidad: number | null;
  abierta: boolean | null;
  validado: boolean | null;
  incompleto: boolean | null;
  lote: string | null;
  vencimiento: string | null;
}

export interface ParadaOrigen {
  paradaId: number;
  ofId: number;
  inicio: string | null;
  fin: string | null;
  segundos: number | null;
  comentario: string | null;
  numeroSolicitud: string | null;
  /**
   * Id crudo de `paradas_categoria_especifica_lnk.categoria_especifica_id`.
   * **No** es el id vigente de `parada_categoria_especificas`: esa tabla se
   * renumeró en algún momento y las paradas siguen apuntando a la numeración
   * del maestro (`causas-parada.json` → `idLegado`). Ver `mapeo.ts`.
   */
  categoriaEspecificaId: number | null;
  registroSeg: number | null;
}

export interface MermaOrigen {
  mermaId: number;
  ofId: number;
  hora: string | null;
  pesoKg: number | null;
  comentario: string | null;
  numeroSolicitud: string | null;
  /** Id crudo de `calidads_merma_causa_lnk.merma_causa_id` (= `idLegado` del maestro). */
  causaLegadoId: number | null;
  /** Sólo para diagnóstico: el árbol de la causa se resuelve por `causaLegadoId`. */
  causaNombre: string | null;
  tipoMermaNombre: string | null;
  sabor: string | null;
  registroSeg: number | null;
}

export interface VelocidadOrigen {
  velocidadId: number;
  ofId: number;
  hora: string | null;
  velocidadUnidHora: number | null;
  codificadoraCajas: number | null;
  observacion: string | null;
  registroSeg: number | null;
}

/** Producto del maestro real, para dar de alta los que falten en el MES. */
export interface ProductoOrigen {
  codigo: string;
  descripcionLarga: string | null;
  descripcionCorta: string | null;
  alias: string | null;
  marca: string | null;
  presentacion: string | null;
  unidades: number | null;
  pesoKg: number | null;
  estado: boolean | null;
}

const FMT = `'YYYY-MM-DD"T"HH24:MI:SS'`;
/** `created_at` está en UTC; el resto de horas del origen, en hora de Lima. */
const CREADO_LIMA = `(%s.created_at at time zone 'UTC' at time zone 'America/Lima')`;

function creadoLima(alias: string): string {
  return CREADO_LIMA.replace('%s', alias);
}

/** Lector minimalista de `.env` (el script corre fuera del contexto Nest). */
function leerEnv(ruta: string): Record<string, string> {
  const valores: Record<string, string> = {};
  if (!existsSync(ruta)) return valores;
  for (const linea of readFileSync(ruta, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 0) continue;
    valores[limpia.slice(0, corte).trim()] = limpia
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return valores;
}

/**
 * Resuelve la cadena de conexión del origen, en este orden:
 *   1. `--origen=postgres://…`
 *   2. `ORIGEN_DATABASE_URL` del entorno / `apps/api/.env`
 *   3. las claves `DATABASE_*` del `.env` de `yamboli-back`
 *      (`ORIGEN_ENV_YAMBOLI_BACK`, por defecto `../../../yamboli-back/.env`)
 */
export function resolverUrlOrigen(explicita?: string): string {
  if (explicita) return explicita;
  if (process.env.ORIGEN_DATABASE_URL?.trim()) return process.env.ORIGEN_DATABASE_URL.trim();

  const rutaEnv = resolve(
    process.cwd(),
    process.env.ORIGEN_ENV_YAMBOLI_BACK?.trim() || '../../../yamboli-back/.env',
  );
  const env = leerEnv(rutaEnv);
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const { DATABASE_HOST: host, DATABASE_PORT: puerto, DATABASE_NAME: base } = env;
  const usuario = env.DATABASE_USERNAME;
  const clave = env.DATABASE_PASSWORD;
  if (!host || !base || !usuario) {
    throw new Error(
      `No se pudo resolver el origen. Usa --origen=postgres://…, define ORIGEN_DATABASE_URL ` +
        `o apunta ORIGEN_ENV_YAMBOLI_BACK al .env de yamboli-back (probado: ${rutaEnv}).`,
    );
  }
  const credenciales = clave
    ? `${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}`
    : encodeURIComponent(usuario);
  return `postgres://${credenciales}@${host}:${puerto || 5432}/${base}`;
}

/** Oculta la contraseña al imprimir la URL de conexión. */
export function ocultarClave(url: string): string {
  return url.replace(/:\/\/[^@]*@/, '://***@');
}

export class OrigenReal {
  private cerrada = false;
  private enTransaccion = false;

  private constructor(private readonly cliente: Client) {}

  static async abrir(url: string): Promise<OrigenReal> {
    const cliente = new Client({ connectionString: url, ssl: false, application_name: 'mes-sync' });
    try {
      await cliente.connect();
      /* Sesión de sólo lectura: cualquier INSERT/UPDATE accidental falla. */
      await cliente.query('set session characteristics as transaction read only');
      await cliente.query(`set statement_timeout='120s'`);
      await cliente.query(`set lock_timeout='5s'`);
      await cliente.query(`set idle_in_transaction_session_timeout='600s'`);
      const { rows } = await cliente.query<{ zonaHoraria: string }>(
        `select current_setting('TimeZone') as "zonaHoraria"`,
      );
      console.log(`  zona horaria del origen  ${rows[0].zonaHoraria}`);
      return new OrigenReal(cliente);
    } catch (error) {
      await cliente.end().catch(() => undefined);
      throw error;
    }
  }

  async cerrar(): Promise<void> {
    if (this.cerrada) return;
    try {
      if (this.enTransaccion) await this.cliente.query('rollback');
    } finally {
      this.enTransaccion = false;
      try {
        await this.cliente.end();
      } finally {
        this.cerrada = true;
      }
    }
  }

  /** Fija un único snapshot para las cinco consultas de extracción. */
  async iniciarSnapshot(): Promise<void> {
    await this.cliente.query('begin transaction isolation level repeatable read read only');
    this.enTransaccion = true;
  }

  async confirmarSnapshot(): Promise<void> {
    if (!this.enTransaccion) return;
    await this.cliente.query('commit');
    this.enTransaccion = false;
  }

  async fechaDelServidor(): Promise<string> {
    const { rows } = await this.cliente.query<{ hoy: string }>(
      `select to_char(current_date,'YYYY-MM-DD') as hoy`,
    );
    return rows[0].hoy;
  }

  /** OFs con registro de ejecución dentro de la ventana `[desde, hasta]`. */
  async ordenes(desde: string, hasta: string): Promise<OrdenOrigen[]> {
    const { rows } = await this.cliente.query(
      `select
         o.id                                as "ofId",
         d.orden_fabricacion                 as "codigo",
         to_char(d.fecha,'YYYY-MM-DD')       as "fecha",
         d.turno                             as "turno",
         nullif(trim(d.codigo_producto),'')  as "codigoProducto",
         nullif(trim(d.producto),'')         as "producto",
         nullif(trim(d.linea_produccion),'') as "lineaProduccion",
         d.velocidad_estandar                as "velocidadEstandarTexto",
         coalesce(nullif(regexp_replace(coalesce(d.planificado,''), '[^0-9]', '', 'g'),'')::int, 0) as "planificadoCajas",
         d.tipo_produccion                   as "tipoProduccion",
         nullif(trim(o.maquinista),'')       as "maquinista",
         nullif(trim(o.supervisor),'')       as "supervisor",
         o.numero_operarios                  as "numeroOperarios",
         nullif(trim(o.comentarios),'')      as "comentarios",
         to_char(o.hora_inicio,${FMT})       as "inicio",
         to_char(o.hora_fin,${FMT})          as "fin",
         o.total_producido                   as "totalProducidoCajas",
         o.total_producido_codificadora      as "totalCodificadoraCajas",
         v.max_codificadora                  as "maxCodificadoraCajas",
         o.disponibilidad::float8            as "disponibilidad",
         o.rendimiento::float8               as "rendimiento",
         o.calidad::float8                   as "calidad",
         o.estado                            as "abierta",
         o.validado                          as "validado",
         o.incompleto                        as "incompleto",
         nullif(trim(o.lote),'')             as "lote",
         to_char(o.fecha_vencimiento,'YYYY-MM-DD') as "vencimiento"
       from orden_fabricacion_dbs d
       join orden_fabricacion_dbs_orden_lnk l on l.orden_fabricacion_db_id = d.id
       join orden_fabricacions o            on o.id = l.orden_fabricacion_id
       left join lateral (
         select max(r.cantidad_codificadora) as max_codificadora
         from rendimientos r
         join rendimientos_of_lnk rl on rl.rendimiento_id = r.id
         where rl.orden_fabricacion_id = o.id
       ) v on true
       where d.fecha between $1::date and $2::date
       order by d.fecha, d.linea_produccion, o.hora_inicio, o.id`,
      [desde, hasta],
    );
    return rows as OrdenOrigen[];
  }

  /** Paradas de las OFs indicadas, con el árbol específica → general → tipo. */
  async paradas(ofIds: number[]): Promise<ParadaOrigen[]> {
    if (ofIds.length === 0) return [];
    const { rows } = await this.cliente.query(
      `select
         p.id                                as "paradaId",
         po.orden_fabricacion_id             as "ofId",
         to_char(p.hora_inicio,${FMT})       as "inicio",
         to_char(p.hora_fin,${FMT})          as "fin",
         p.tiempo                            as "segundos",
         nullif(trim(p.comentario),'')       as "comentario",
         nullif(trim(p.numero_solicitud),'') as "numeroSolicitud",
         pe.categoria_especifica_id          as "categoriaEspecificaId",
         extract(epoch from (${creadoLima('p')} - coalesce(p.hora_fin, p.hora_inicio)))::int as "registroSeg"
       from paradas p
       join paradas_of_lnk po on po.parada_id = p.id
       left join paradas_categoria_especifica_lnk pe on pe.parada_id = p.id
       where po.orden_fabricacion_id = any($1::int[])
       order by p.hora_inicio, p.id`,
      [ofIds],
    );
    return rows as ParadaOrigen[];
  }

  /**
   * Mermas: en el sistema real viven en `calidads` (peso en kg), colgadas de la
   * OF, con causa (`merma_causas`), su clasificación y tipo de producción, el
   * destino (`tipo_mermas`: recuperable / reproceso / desperdicio) y el sabor.
   */
  async mermas(ofIds: number[]): Promise<MermaOrigen[]> {
    if (ofIds.length === 0) return [];
    const { rows } = await this.cliente.query(
      `select
         c.id                                as "mermaId",
         co.orden_fabricacion_id             as "ofId",
         to_char(c.hora,${FMT})              as "hora",
         c.peso::float8                      as "pesoKg",
         nullif(trim(c.comentario),'')       as "comentario",
         nullif(trim(c.numero_solicitud),'') as "numeroSolicitud",
         lmc.merma_causa_id                  as "causaLegadoId",
         mc.nombre                           as "causaNombre",
         tm.nombre                           as "tipoMermaNombre",
         sa.nombre                           as "sabor",
         extract(epoch from (${creadoLima('c')} - c.hora))::int as "registroSeg"
       from calidads c
       join calidads_of_lnk co on co.calidad_id = c.id
       left join calidads_merma_causa_lnk lmc on lmc.calidad_id = c.id
       left join merma_causas mc              on mc.id = lmc.merma_causa_id
       left join calidads_tipo_merma_lnk ltm  on ltm.calidad_id = c.id
       left join tipo_mermas tm               on tm.id = ltm.tipo_merma_id
       left join calidads_sabor_lnk lsa       on lsa.calidad_id = c.id
       left join sabores sa                   on sa.id = lsa.sabor_id
       where co.orden_fabricacion_id = any($1::int[])
       order by c.hora, c.id`,
      [ofIds],
    );
    return rows as MermaOrigen[];
  }

  /** Lecturas de velocidad (`rendimientos`): u/h y conteo acumulado de cajas. */
  async velocidades(ofIds: number[]): Promise<VelocidadOrigen[]> {
    if (ofIds.length === 0) return [];
    const { rows } = await this.cliente.query(
      `select
         r.id                            as "velocidadId",
         rl.orden_fabricacion_id         as "ofId",
         to_char(r.hora,${FMT})          as "hora",
         r.velocidad::float8             as "velocidadUnidHora",
         r.cantidad_codificadora         as "codificadoraCajas",
         nullif(trim(r.observacion),'')  as "observacion",
         extract(epoch from (${creadoLima('r')} - r.hora))::int as "registroSeg"
       from rendimientos r
       join rendimientos_of_lnk rl on rl.rendimiento_id = r.id
       where rl.orden_fabricacion_id = any($1::int[])
       order by r.hora, r.id`,
      [ofIds],
    );
    return rows as VelocidadOrigen[];
  }

  /** Productos del maestro real por código (para altas puntuales en el MES). */
  async productos(codigos: string[]): Promise<ProductoOrigen[]> {
    if (codigos.length === 0) return [];
    const { rows } = await this.cliente.query(
      `select
         p.codigo                             as "codigo",
         nullif(trim(p.descripcion_larga),'') as "descripcionLarga",
         nullif(trim(p.descripcion_corta),'') as "descripcionCorta",
         nullif(trim(p.alias),'')             as "alias",
         nullif(trim(p.marca),'')             as "marca",
         nullif(trim(p.presentacion),'')      as "presentacion",
         p.unidades                           as "unidades",
         p.peso_kg::float8                    as "pesoKg",
         p.estado                             as "estado"
       from productos p
       where p.codigo = any($1::text[])`,
      [codigos],
    );
    return rows as ProductoOrigen[];
  }
}
