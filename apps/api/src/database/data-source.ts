import { DataSource, type DataSourceOptions } from 'typeorm';
import * as entidades from './entities';

/** Todas las entidades registradas en `entities/index.ts` (B1 + B2). */
export const ENTITIES = Object.values(entidades) as unknown as Function[];

/** Parámetros con los que se elige el motor de base de datos. */
export interface OpcionesMotor {
  /** Cadena `postgres://usuario:clave@host:puerto/base`; si existe, gana. */
  databaseUrl?: string | null;
  /** Ruta del archivo SQLite (o `:memory:`) usada como respaldo. */
  dbPath?: string | null;
}

/** Opciones TypeORM comunes a los dos motores. */
const COMUNES = {
  entities: ENTITIES,
  synchronize: true,
  logging: false,
} as const;

/**
 * Selecciona el motor: PostgreSQL cuando hay `DATABASE_URL` (entorno normal,
 * Docker) y SQLite en cualquier otro caso (e2e en memoria, arranque sin Docker).
 * Se exporta aparte de `crearDataSource` para poder probarla sin abrir conexión.
 */
export function opcionesDataSource(opciones: OpcionesMotor): DataSourceOptions {
  const url = opciones.databaseUrl?.trim();
  if (url) return { type: 'postgres', url, ...COMUNES };
  return { type: 'sqlite', database: opciones.dbPath?.trim() || ':memory:', ...COMUNES };
}

/** DataSource independiente de Nest, usado por el runner de seeds y los tests. */
export function crearDataSource(opciones: OpcionesMotor | string): DataSource {
  const normalizadas = typeof opciones === 'string' ? { dbPath: opciones } : opciones;
  return new DataSource(opcionesDataSource(normalizadas));
}

/**
 * Vacía todas las tablas de entidades conservando el esquema. En PostgreSQL usa
 * un único `TRUNCATE … CASCADE`; en SQLite, un `DELETE` por tabla.
 */
export async function vaciarTablas(dataSource: DataSource): Promise<void> {
  const tablas = dataSource.entityMetadatas.map((m) => m.tableName);
  if (tablas.length === 0) return;
  if (dataSource.options.type === 'postgres') {
    const lista = tablas.map((t) => `"${t}"`).join(', ');
    await dataSource.query(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
    return;
  }
  for (const tabla of tablas) await dataSource.query(`DELETE FROM "${tabla}"`);
}
