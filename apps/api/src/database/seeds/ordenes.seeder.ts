import type { DataSource } from 'typeorm';
import { AuditEvent, OrdenFabricacion } from '../entities';
import { bitacora, ordenes } from './data';
import type { Seeder } from './seeder.interface';

export const ordenesSeeder: Seeder = {
  name: 'ordenes',
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.getRepository(OrdenFabricacion).save(
      ordenes.map((o) => ({
        ...o,
        velocidadEstandarId: o.velocidadEstandarId ?? null,
        observacion: o.observacion ?? null,
      })),
      { chunk: 50 },
    );
    await dataSource.getRepository(AuditEvent).save(
      bitacora.map((b) => ({ ...b })),
      { chunk: 100 },
    );
  },
};
