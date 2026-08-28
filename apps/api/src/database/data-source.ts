import { DataSource } from 'typeorm';
import * as entidades from './entities';

/** Todas las entidades registradas en `entities/index.ts` (B1 + B2). */
export const ENTITIES = Object.values(entidades) as unknown as Function[];

/** DataSource independiente de Nest, usado por el runner de seeds y los tests. */
export function crearDataSource(database: string): DataSource {
  return new DataSource({
    type: 'sqlite',
    database,
    entities: ENTITIES,
    synchronize: true,
    logging: false,
  });
}
