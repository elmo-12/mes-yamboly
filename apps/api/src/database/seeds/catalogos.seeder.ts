import type { DataSource } from 'typeorm';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  Producto,
  Sabor,
  Sede,
  Turno,
  VelocidadEstandar,
} from '../entities';
import {
  causasMerma,
  causasParada,
  lineas,
  maquinas,
  productos,
  sabores,
  sedes,
  turnos,
  velocidadesEstandar,
} from './data';
import type { Seeder } from './seeder.interface';

/**
 * Catálogos maestros reales: 9 sedes · 2 turnos · 9 líneas · 41 sabores ·
 * 201 productos · 334 pares producto × línea · 33 máquinas ·
 * 83 causas de parada · 56 causas de merma.
 */
export const catalogosSeeder: Seeder = {
  name: 'catalogos',
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.getRepository(Sede).save(sedes.map((s) => ({ ...s })));
    await dataSource.getRepository(Turno).save(turnos.map((t) => ({ ...t })));
    await dataSource.getRepository(Linea).save(lineas.map((l) => ({ ...l })));
    await dataSource.getRepository(Sabor).save(sabores.map((s) => ({ ...s })));
    await dataSource
      .getRepository(Producto)
      .save(productos.map((p) => ({ ...p, alias: p.alias ?? null, marca: p.marca ?? null, presentacion: p.presentacion ?? null, saborId: p.saborId ?? null })), { chunk: 100 });
    await dataSource
      .getRepository(VelocidadEstandar)
      .save(velocidadesEstandar.map((v) => ({ ...v })), { chunk: 100 });
    await dataSource.getRepository(Maquina).save(maquinas.map((m) => ({ ...m })));
    await dataSource
      .getRepository(CausaParada)
      .save(causasParada.map((c) => ({ ...c, codigoLegado: c.codigoLegado ?? null })));
    await dataSource.getRepository(CausaMerma).save(causasMerma.map((c) => ({ ...c })));
  },
};
