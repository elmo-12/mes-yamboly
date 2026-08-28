import type { DataSource } from 'typeorm';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  Producto,
  Sede,
  Turno,
} from '../entities';
import { causasMerma, causasParada, lineas, maquinas, productos, sedes, turnos } from './data';
import type { Seeder } from './seeder.interface';

export const catalogosSeeder: Seeder = {
  name: 'catalogos',
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.getRepository(Sede).save(sedes.map((s) => ({ ...s })));
    await dataSource.getRepository(Turno).save(turnos.map((t) => ({ ...t })));
    await dataSource.getRepository(Linea).save(lineas.map((l) => ({ ...l })));
    await dataSource.getRepository(Producto).save(productos.map((p) => ({ ...p })));
    await dataSource.getRepository(Maquina).save(maquinas.map((m) => ({ ...m })));
    await dataSource.getRepository(CausaParada).save(causasParada.map((c) => ({ ...c })));
    await dataSource.getRepository(CausaMerma).save(causasMerma.map((c) => ({ ...c })));
  },
};
