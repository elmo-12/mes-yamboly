import type { DataSource } from 'typeorm';

/** Contrato de un seeder: nombre para el log y ejecución idempotente. */
export interface Seeder {
  readonly name: string;
  run(dataSource: DataSource): Promise<void>;
}
