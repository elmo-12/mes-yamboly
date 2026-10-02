import type { DataSource } from 'typeorm';
import { OrdenSap } from '../entities';
import { ordenesSap } from './data';
import type { Seeder } from './seeder.interface';

/**
 * Órdenes SAP pendientes de demostración (`SAPD-…`). `save` es un upsert por
 * id, así que el seeder es idempotente y puede relanzarse sobre una base con
 * datos reales sin duplicar filas.
 */
export const ordenesSapSeeder: Seeder = {
  name: 'ordenes-sap',
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.getRepository(OrdenSap).save(
      ordenesSap.map((o) => ({ ...o })),
      { chunk: 50 },
    );
  },
};
