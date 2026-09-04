import type { DataSource } from 'typeorm';
import { DeteccionIoT, Parada } from '../entities';
import { detecciones, paradas } from './data';
import type { Seeder } from './seeder.interface';

export const paradasSeeder: Seeder = {
  name: 'paradas',
  /**
   * `parada.deteccionId` y `deteccion_iot.paradaId` se apuntan mutuamente: con
   * las FKs reales hay que romper el ciclo en tres pasos — detecciones sin
   * `paradaId`, paradas (que ya encuentran su detección) y, al final, el
   * `paradaId` de las detecciones confirmadas.
   */
  async run(dataSource: DataSource): Promise<void> {
    const repoDetecciones = dataSource.getRepository(DeteccionIoT);
    await repoDetecciones.save(detecciones.map((d) => ({ ...d, paradaId: null })));
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
    for (const d of detecciones) {
      if (d.paradaId) await repoDetecciones.update({ id: d.id }, { paradaId: d.paradaId });
    }
  },
};
