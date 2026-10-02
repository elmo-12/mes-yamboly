/**
 * Recorte de datos reales para la imagen de Docker: `pnpm --filter @mes/api exportar:demo`.
 *
 * Copia de PostgreSQL a un SQLite nuevo (`docker/semilla/mes.sqlite`) los
 * catálogos, usuarios y demás tablas completas, pero de producción sólo las
 * órdenes con `fecha >= --desde` y sus paradas, mermas, velocidades y
 * bitácora. Con la ventana por defecto salen ~400 muestras «anticipado».
 *
 * Las personas se anonimizan (`anonimizarPersonas`): la imagen es pública.
 * Las 11 cuentas de demostración (`USR-01`…`USR-11`, ficticias) se conservan;
 * los usuarios reales que creó la sincronización (`USR-R-<nombre>`) pasan a
 * `USR-A-NN` / «Maquinista NN» / «Supervisor NN» en todas las tablas que los
 * referencian, y sus nombres se borran de los textos libres.
 *
 * Lo derivado del modelo (`muestra_analitica`, `modelo_version`, `prediccion`,
 * `entrenamiento_ejecucion`, `alerta`) no se copia: el contenedor entrena su
 * propio modelo sobre el recorte en el primer arranque (`docker/entrenar-inicial.js`)
 * y el ciclo de inferencia regenera predicciones y alertas.
 *
 * Opciones:
 *   --desde=AAAA-MM-DD  primer día de producción copiado (por defecto 2026-07-22)
 *   --url=<postgres>    origen (por defecto `DATABASE_URL`)
 *   --salida=<ruta>     destino (por defecto `../../docker/semilla/mes.sqlite`)
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DataSource, type ObjectLiteral } from 'typeorm';
import { ENTITIES } from '../src/database/data-source';

const TAMANO_LOTE = 500;
const DESDE_DEFECTO = '2026-07-22';

/** Tablas que regenera el propio contenedor (modelo, inferencia, alertas). */
const DERIVADAS = new Set([
  'muestra_analitica',
  'modelo_version',
  'prediccion',
  'entrenamiento_ejecucion',
  'alerta',
]);

/** Tablas hijas de la orden: se quedan sólo las de órdenes dentro de la ventana. */
const HIJAS_DE_ORDEN = new Set(['parada', 'merma', 'registro_velocidad', 'audit_event']);

/** Cuentas ficticias de `seeds/data/users.ts`: se quedan tal cual. */
const ES_USUARIO_DEMO = /^USR-\d+$/;

/** Columnas que apuntan a `usuario.id`. */
const REFERENCIAS_USUARIO: Array<[tabla: string, columna: string]> = [
  ['orden_fabricacion', 'maquinistaId'],
  ['orden_fabricacion', 'supervisorId'],
  ['parada', 'responsableId'],
  ['merma', 'responsableId'],
  ['registro_velocidad', 'responsableId'],
  ['registro_tiempo', 'usuarioId'],
  ['encuesta_sesion', 'usuarioId'],
];

/** Textos libres donde alguien pudo escribir el nombre de una persona. */
const TEXTOS_LIBRES: Array<[tabla: string, columna: string]> = [
  ['orden_fabricacion', 'observacion'],
  ['parada', 'accionTomada'],
  ['parada', 'comentarioCierre'],
  ['merma', 'observacion'],
  ['registro_tiempo', 'observacion'],
  ['encuesta_respuesta', 'comentario'],
  ['audit_event', 'usuario'],
  ['audit_event', 'texto'],
];

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sustituye a los usuarios reales por alias y limpia sus nombres de los textos
 * libres: primero el nombre completo y luego cada palabra de 4+ letras del
 * nombre (apellidos o nombres sueltos). Devuelve cuántos usuarios y textos tocó.
 */
async function anonimizarPersonas(db: DataSource): Promise<{ usuarios: number; textos: number }> {
  const reales = (
    (await db.query('SELECT id, nombre, rol FROM usuario ORDER BY rol, id')) as Array<{
      id: string;
      nombre: string;
      rol: string;
    }>
  ).filter((u) => !ES_USUARIO_DEMO.test(u.id));

  const reemplazos: Array<[RegExp, string]> = [];
  const contadorPorRol = new Map<string, number>();
  for (const [i, usuario] of reales.entries()) {
    const n = (contadorPorRol.get(usuario.rol) ?? 0) + 1;
    contadorPorRol.set(usuario.rol, n);
    const numero = String(n).padStart(2, '0');
    const etiqueta = usuario.rol.charAt(0).toUpperCase() + usuario.rol.slice(1);
    const alias = `${etiqueta} ${numero}`;
    const id = `USR-A-${String(i + 1).padStart(2, '0')}`;

    await db.query(
      'UPDATE usuario SET id = ?, nombre = ?, email = ?, dni = ?, iniciales = ?, avatarUrl = NULL, ultimoAcceso = NULL WHERE id = ?',
      [id, alias, `${usuario.rol}.${numero}@demo.yamboly.lat`, String(90_000_001 + i), `${etiqueta.charAt(0)}${n}`, usuario.id],
    );
    for (const [tabla, columna] of REFERENCIAS_USUARIO) {
      await db.query(`UPDATE "${tabla}" SET "${columna}" = ? WHERE "${columna}" = ?`, [id, usuario.id]);
    }

    reemplazos.push([new RegExp(escaparRegex(usuario.nombre), 'gi'), alias]);
    for (const palabra of usuario.nombre.split(/\s+/).filter((p) => p.length >= 4)) {
      reemplazos.push([new RegExp(`(?<![\\p{L}])${escaparRegex(palabra)}(?![\\p{L}])`, 'giu'), alias]);
    }
  }

  let textos = 0;
  for (const [tabla, columna] of TEXTOS_LIBRES) {
    const filas = (await db.query(
      `SELECT rowid AS fila, "${columna}" AS texto FROM "${tabla}" WHERE "${columna}" IS NOT NULL AND "${columna}" <> ''`,
    )) as Array<{ fila: number; texto: string }>;
    for (const { fila, texto } of filas) {
      const limpio = reemplazos.reduce((t, [patron, alias]) => t.replace(patron, alias), texto);
      if (limpio === texto) continue;
      await db.query(`UPDATE "${tabla}" SET "${columna}" = ? WHERE rowid = ?`, [limpio, fila]);
      textos++;
    }
  }

  /* Los colaboradores de planta van con nombre dentro de la orden (JSON). */
  await db.query(`UPDATE orden_fabricacion SET colaboradores = '[]' WHERE colaboradores <> '[]'`);

  return { usuarios: reales.length, textos };
}

/** Lector minimalista de `.env` (el script corre fuera del contexto Nest). */
function cargarEnv(archivo = '.env'): void {
  const ruta = resolve(process.cwd(), archivo);
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const separador = limpia.indexOf('=');
    if (separador < 0) continue;
    const clave = limpia.slice(0, separador).trim();
    const valor = limpia
      .slice(separador + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

function leerOpcion(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}

function trocear<T>(filas: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < filas.length; i += tamano) lotes.push(filas.slice(i, i + tamano));
  return lotes;
}

async function main(): Promise<void> {
  cargarEnv();

  const desde = leerOpcion('desde') ?? DESDE_DEFECTO;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error(`--desde inválido: ${desde}`);
  const url = leerOpcion('url') ?? process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('Falta el origen: define DATABASE_URL o pasa --url=postgres://…');
  const salida = resolve(process.cwd(), leerOpcion('salida') ?? '../../docker/semilla/mes.sqlite');

  mkdirSync(dirname(salida), { recursive: true });
  rmSync(salida, { force: true });

  const origen = new DataSource({ type: 'postgres', url, entities: ENTITIES, synchronize: false, logging: false });
  const destino = new DataSource({ type: 'sqlite', database: salida, entities: ENTITIES, synchronize: true, logging: false });
  await origen.initialize();
  await destino.initialize();
  console.log(`Ventana de producción: desde ${desde} · destino ${salida}`);

  try {
    await destino.query('PRAGMA foreign_keys = OFF');
    for (const meta of destino.entityMetadatas) {
      const tabla = meta.tableName;
      if (DERIVADAS.has(tabla)) {
        process.stdout.write(`· ${tabla} (omitida: la regenera el contenedor)\n`);
        continue;
      }

      const consulta = origen.getRepository<ObjectLiteral>(meta.target).createQueryBuilder('t');
      if (tabla === 'orden_fabricacion') {
        consulta.where('t.fecha >= :desde', { desde });
      } else if (HIJAS_DE_ORDEN.has(tabla)) {
        consulta.where('t."ordenId" IN (SELECT id FROM orden_fabricacion WHERE fecha >= :desde)', { desde });
      } else if (tabla === 'orden_sap') {
        /* Pendientes siempre; consumidas, sólo si su orden entra en el recorte. */
        consulta.where(
          't."ordenId" IS NULL OR t."ordenId" IN (SELECT id FROM orden_fabricacion WHERE fecha >= :desde)',
          { desde },
        );
      } else if (tabla === 'deteccion_iot') {
        consulta.where('t."detectadaEn" >= :desde', { desde });
      }
      const filas = await consulta.getMany();

      const repoDestino = destino.getRepository<ObjectLiteral>(meta.target);
      for (const lote of trocear(filas, TAMANO_LOTE)) {
        await repoDestino.createQueryBuilder().insert().values(lote).execute();
      }
      process.stdout.write(`· ${tabla} (${filas.length})\n`);
    }
    const anonimizado = await anonimizarPersonas(destino);
    console.log(
      `\nAnonimizados: ${anonimizado.usuarios} usuarios reales · ${anonimizado.textos} textos libres con nombres`,
    );
    await destino.query('PRAGMA foreign_keys = ON');
    await destino.query('VACUUM');
    console.log(`\n✓ Recorte listo en ${salida}`);
  } finally {
    await origen.destroy();
    await destino.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
