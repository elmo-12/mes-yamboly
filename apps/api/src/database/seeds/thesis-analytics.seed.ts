import type { DataSource } from 'typeorm';
import { ModeloVersion, Prediccion } from '../entities';
import { fechaMenos, pad, rng } from './thesis-seed.util';
import type { Seeder } from './seeder.interface';

/** Analítica IA (spec 08): modelo v3.2 sobre 2 140 eventos, AUC 0,86 · F1 0,79. */

const VERSIONES = [
  { version: 'v3.2', entrenadoEn: '2026-08-24', eventos: 2140, auc: 0.86, f1: 0.79, precision: 81, recall: 77, features: 14, alertas30d: 142, estado: 'vigente' as const },
  { version: 'v3.1', entrenadoEn: '2026-07-27', eventos: 1880, auc: 0.83, f1: 0.75, precision: 78, recall: 73, features: 13, alertas30d: 128, estado: 'archivada' as const },
  { version: 'v3.0', entrenadoEn: '2026-06-29', eventos: 1610, auc: 0.79, f1: 0.71, precision: 74, recall: 69, features: 12, alertas30d: 111, estado: 'archivada' as const },
];

export class ThesisAnalyticsSeeder implements Seeder {
  readonly name = 'analítica (modelo y predicciones)';

  async run(dataSource: DataSource): Promise<void> {
    const repoVersion = dataSource.getRepository(ModeloVersion);
    if (!(await repoVersion.count())) {
      await repoVersion.save(VERSIONES.map((v, i) => repoVersion.create({ ...v, orden: i })));
    }

    const repo = dataSource.getRepository(Prediccion);
    if (await repo.count()) return;
    /* `rng(707)` reproduce las probabilidades del histórico del mock. */
    const r = rng(707);
    const lineas = ['L1', 'L2', 'L3', 'L4', 'L5'];
    const tipos = ['Parada prevista', 'Merma prevista', 'Velocidad baja', 'OEE bajo umbral'];
    const filas: Prediccion[] = [];
    for (let i = 0; i < 24; i += 1) {
      const lineaCodigo = lineas[i % lineas.length]!;
      const tipo = tipos[i % tipos.length]!;
      const acierto = i % 6 !== 5;
      filas.push(
        repo.create({
          id: `PRD-HIS-${pad(i + 1)}`,
          fecha: fechaMenos(Math.floor(i / 2) + 1),
          lineaCodigo,
          tipo,
          prediccion: `${tipo} en ${lineaCodigo}`,
          probabilidad: r.int(70, 94),
          eventoReal: acierto ? 'Evento ocurrido dentro de la ventana' : 'Sin evento en la ventana',
          acierto,
          modeloVersion: 'v3.2',
        }),
      );
    }
    await repo.save(filas);
  }
}
