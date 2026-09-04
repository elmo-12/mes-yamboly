/**
 * Migración de datos SQLite → PostgreSQL: `pnpm --filter @mes/api migrar:pg`.
 *
 * Abre dos `DataSource` (el SQLite de origen en solo lectura y el PostgreSQL de
 * destino, que crea su esquema con `synchronize`), copia tabla por tabla en el
 * orden de `ENTITIES` —el mismo de `entities/index.ts`, ya ordenado por
 * dependencias— en lotes de 500 filas conservando los ids, y termina imprimiendo
 * la tabla `entidad | sqlite | postgres`. Sale con código 1 si algún conteo no
 * coincide.
 *
 * Es idempotente: los `INSERT` llevan `ON CONFLICT DO NOTHING`, así que volver a
 * ejecutarlo no duplica filas. Con `--reset` se vacían antes las tablas destino.
 *
 * Opciones:
 *   --reset            vacía las tablas de PostgreSQL antes de copiar
 *   --sqlite=<ruta>    origen (por defecto `DB_PATH` o `./data/mes.sqlite`)
 *   --url=<postgres>   destino (por defecto `DATABASE_URL`)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, type EntityMetadata, type ObjectLiteral } from 'typeorm';
import { ENTITIES, vaciarTablas } from '../src/database/data-source';

const TAMANO_LOTE = 500;

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

/** Oculta la contraseña al imprimir la URL de conexión. */
function ocultarClave(url: string): string {
  return url.replace(/:\/\/[^@]*@/, '://***@');
}

async function contar(dataSource: DataSource, meta: EntityMetadata): Promise<number> {
  return dataSource.getRepository<ObjectLiteral>(meta.target).count();
}

async function main(): Promise<void> {
  cargarEnv();

  const rutaSqlite = resolve(
    process.cwd(),
    leerOpcion('sqlite') ?? process.env.DB_PATH ?? './data/mes.sqlite',
  );
  const url = leerOpcion('url') ?? process.env.DATABASE_URL?.trim();
  const reset = process.argv.includes('--reset');

  if (!existsSync(rutaSqlite)) {
    throw new Error(`No existe el SQLite de origen: ${rutaSqlite}`);
  }
  if (!url) {
    throw new Error(
      'Falta el destino: define DATABASE_URL en apps/api/.env o pasa --url=postgres://…',
    );
  }

  console.log(`Origen  (sqlite)   ${rutaSqlite}`);
  console.log(`Destino (postgres) ${ocultarClave(url)}`);

  /* `synchronize: false`: el origen no se toca, ni siquiera para alinear tipos. */
  const origen = new DataSource({
    type: 'sqlite',
    database: rutaSqlite,
    entities: ENTITIES,
    synchronize: false,
    logging: false,
  });
  const destino = new DataSource({
    type: 'postgres',
    url,
    entities: ENTITIES,
    synchronize: true,
    logging: false,
  });

  await origen.initialize();
  await destino.initialize();
  console.log(`Esquema creado en PostgreSQL (${destino.entityMetadatas.length} tablas)`);

  try {
    if (reset) {
      await vaciarTablas(destino);
      console.log('--reset: tablas de PostgreSQL vaciadas');
    }

    const conteos: { entidad: string; tabla: string; sqlite: number; postgres: number }[] = [];

    for (const meta of destino.entityMetadatas) {
      const metaOrigen = origen.getMetadata(meta.target);
      const repoOrigen = origen.getRepository<ObjectLiteral>(meta.target);
      const repoDestino = destino.getRepository<ObjectLiteral>(meta.target);

      const filas = await repoOrigen.find();
      for (const lote of trocear(filas, TAMANO_LOTE)) {
        await repoDestino
          .createQueryBuilder()
          .insert()
          .values(lote)
          .orIgnore() /* ON CONFLICT DO NOTHING → re-ejecutable */
          .execute();
      }

      conteos.push({
        entidad: meta.name,
        tabla: meta.tableName,
        sqlite: await contar(origen, metaOrigen),
        postgres: await contar(destino, meta),
      });
      process.stdout.write(`· ${meta.tableName} (${filas.length})\n`);
    }

    const ancho = {
      entidad: Math.max(7, ...conteos.map((c) => c.entidad.length)),
      tabla: Math.max(5, ...conteos.map((c) => c.tabla.length)),
    };
    const linea = (e: string, t: string, s: string, p: string): string =>
      `${e.padEnd(ancho.entidad)} | ${t.padEnd(ancho.tabla)} | ${s.padStart(6)} | ${p.padStart(8)}`;

    console.log('');
    console.log(linea('entidad', 'tabla', 'sqlite', 'postgres'));
    console.log('-'.repeat(ancho.entidad + ancho.tabla + 24));
    for (const c of conteos) {
      console.log(linea(c.entidad, c.tabla, String(c.sqlite), String(c.postgres)));
    }
    const total = conteos.reduce(
      (acc, c) => ({ sqlite: acc.sqlite + c.sqlite, postgres: acc.postgres + c.postgres }),
      { sqlite: 0, postgres: 0 },
    );
    console.log('-'.repeat(ancho.entidad + ancho.tabla + 24));
    console.log(linea('TOTAL', `${conteos.length} tablas`, String(total.sqlite), String(total.postgres)));

    const discrepancias = conteos.filter((c) => c.sqlite !== c.postgres);
    if (discrepancias.length > 0) {
      console.error('');
      for (const c of discrepancias) {
        console.error(`✗ ${c.tabla}: sqlite ${c.sqlite} ≠ postgres ${c.postgres}`);
      }
      throw new Error(`${discrepancias.length} tabla(s) con conteos distintos`);
    }
    console.log('');
    console.log(`✓ Migración completa: ${total.postgres} filas en ${conteos.length} tablas`);
  } finally {
    await origen.destroy();
    await destino.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
