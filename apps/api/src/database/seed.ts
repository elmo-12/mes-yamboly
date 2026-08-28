/**
 * Runner de seeds: `pnpm --filter @mes/api seed`.
 * Borra el archivo SQLite, recrea el esquema y ejecuta todos los `SEEDERS`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { crearDataSource } from './data-source';
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
  const dbPath = resolve(process.cwd(), process.env.DB_PATH ?? './data/mes.sqlite');
  mkdirSync(dirname(dbPath), { recursive: true });
  if (existsSync(dbPath)) {
    rmSync(dbPath);
    console.log(`Base de datos anterior eliminada: ${dbPath}`);
  }

  const dataSource = crearDataSource(dbPath);
  await dataSource.initialize();
  await ejecutarSeeds(dataSource);
  await dataSource.destroy();
  console.log(`Seeds completados en ${dbPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
