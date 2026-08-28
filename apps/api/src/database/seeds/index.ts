import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { User } from '../entities';
import { catalogosSeeder } from './catalogos.seeder';
import { mermasSeeder } from './mermas.seeder';
import { ordenesSeeder } from './ordenes.seeder';
import { paradasSeeder } from './paradas.seeder';
import { usuariosSeeder } from './usuarios.seeder';
import { THESIS_SEEDERS } from './thesis.seeds';
import type { Seeder } from './seeder.interface';

export * from './seeder.interface';

/**
 * Orden de ejecución: catálogos → usuarios → órdenes → paradas → mermas.
 * B2 añade sus seeders AL FINAL de este arreglo (dependen de órdenes y paradas).
 */
export const SEEDERS: Seeder[] = [
  catalogosSeeder,
  usuariosSeeder,
  ordenesSeeder,
  paradasSeeder,
  mermasSeeder,
  /* --- Módulos de tesis (B2) --- */
  ...THESIS_SEEDERS,
];

/** `true` cuando la BD ya tiene datos (evita re-sembrar en cada arranque). */
export async function hayDatos(dataSource: DataSource): Promise<boolean> {
  return (await dataSource.getRepository(User).count()) > 0;
}

export async function ejecutarSeeds(dataSource: DataSource): Promise<void> {
  const logger = new Logger('Seeds');
  for (const seeder of SEEDERS) {
    const inicio = Date.now();
    await seeder.run(dataSource);
    logger.log(`${seeder.name} · ${Date.now() - inicio} ms`);
  }
}
