import type { DataSource } from 'typeorm';
import { SEDE_UNICA_ID } from '@mes/types';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Producto,
  Sabor,
  Turno,
  VelocidadEstandar,
} from '../entities';
import {
  causasMerma,
  causasParada,
  lineas,
  productos,
  sabores,
  turnos,
  velocidadesEstandar,
} from './data';
import type { Seeder } from './seeder.interface';

/**
 * Catálogos maestros reales: 2 turnos · 9 líneas · 41 sabores ·
 * 201 productos · 333 pares producto × línea ·
 * 83 causas de parada · 56 causas de merma.
 */
export const catalogosSeeder: Seeder = {
  name: 'catalogos',
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.getRepository(Turno).save(turnos.map((t) => ({ ...t })));
    /* `sedeId` es una columna interna heredada: la app opera una única sede. */
    await dataSource
      .getRepository(Linea)
      .save(lineas.map((l) => ({ ...l, sedeId: SEDE_UNICA_ID })));
    await dataSource.getRepository(Sabor).save(sabores.map((s) => ({ ...s })));
    await dataSource
      .getRepository(Producto)
      .save(productos.map((p) => ({ ...p, alias: p.alias ?? null, marca: p.marca ?? null, presentacion: p.presentacion ?? null, saborId: p.saborId ?? null })), { chunk: 100 });
    await dataSource
      .getRepository(VelocidadEstandar)
      .save(velocidadesEstandar.map((v) => ({ ...v })), { chunk: 100 });
    await dataSource
      .getRepository(CausaParada)
      .save(causasParada.map((c) => ({ ...c, codigoLegado: c.codigoLegado ?? null })));
    await dataSource.getRepository(CausaMerma).save(causasMerma.map((c) => ({ ...c })));
  },
};
