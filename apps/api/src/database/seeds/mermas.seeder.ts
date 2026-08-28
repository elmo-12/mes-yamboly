import type { DataSource } from 'typeorm';
import { Merma, RegistroVelocidad } from '../entities';
import { mermas, velocidades } from './data';
import type { Seeder } from './seeder.interface';

export const mermasSeeder: Seeder = {
  name: 'mermas-velocidades',
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.getRepository(Merma).save(
      mermas.map((m) => ({
        ...m,
        codigoBalde: m.codigoBalde ?? null,
        observacion: m.observacion ?? null,
      })),
      { chunk: 100 },
    );
    await dataSource.getRepository(RegistroVelocidad).save(
      velocidades.map((v) => ({ ...v, motivo: v.motivo ?? null })),
      { chunk: 100 },
    );
  },
};
