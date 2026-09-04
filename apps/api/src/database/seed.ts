/**
 * Runner de seeds: `pnpm --filter @mes/api seed`.
 * Con `DATABASE_URL` siembra sobre PostgreSQL (vaciando antes las tablas);
 * sin ella borra el archivo SQLite. En ambos casos recrea el esquema
 * (`synchronize`) y ejecuta todos los `SEEDERS`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { crearDataSource, vaciarTablas } from './data-source';
import { ejecutarSeeds } from './seeds';

/** Lector minimalista de `.env` (el runner corre fuera del contexto Nest). */
function cargarEnv(archivo = '.env'): void {
  const ruta = resolve(process.cwd(), archivo);
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const separador = limpia.indexOf('=');
    if (separador < 0) continue;
    const clave = limpia.slice(0, separador).trim();
    const valor = limpia.slice(separador + 1).trim().replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

async function main(): Promise<void> {
  cargarEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  let dbPath: string | undefined;
  let destino: string;
  if (databaseUrl) {
    destino = databaseUrl.replace(/:\/\/[^@]*@/, '://***@');
  } else {
    dbPath = resolve(process.cwd(), process.env.DB_PATH ?? './data/mes.sqlite');
    mkdirSync(dirname(dbPath), { recursive: true });
    if (existsSync(dbPath)) {
      rmSync(dbPath);
      console.log(`Base de datos anterior eliminada: ${dbPath}`);
    }
    destino = dbPath;
  }

  const dataSource = crearDataSource({ databaseUrl, dbPath });
  await dataSource.initialize();
  /* En PostgreSQL el esquema persiste entre corridas: hay que vaciarlo a mano. */
  if (databaseUrl) await vaciarTablas(dataSource);
  await ejecutarSeeds(dataSource);
  await dataSource.destroy();
  console.log(`Seeds completados en ${destino}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
