import type { DataSource } from 'typeorm';
import { DeteccionIoT, Parada } from '../entities';
import { detecciones, paradas } from './data';
import type { Seeder } from './seeder.interface';

export const paradasSeeder: Seeder = {
  name: 'paradas',
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.getRepository(Parada).save(
      paradas.map((p) => ({
        ...p,
        numeroSolicitud: p.numeroSolicitud ?? null,
        evidenciaUrl: p.evidenciaUrl ?? null,
        deteccionId: p.deteccionId ?? null,
        comentarioCierre: p.comentarioCierre ?? null,
      })),
      { chunk: 100 },
    );
    await dataSource.getRepository(DeteccionIoT).save(
      detecciones.map((d) => ({
        ...d,
        paradaId: d.paradaId ?? null,
      })),
    );
  },
};
