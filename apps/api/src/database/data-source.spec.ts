import { ENTITIES, opcionesDataSource } from './data-source';

describe('opcionesDataSource', () => {
  const URL_PG = 'postgres://mes:mes_dev@localhost:5432/mes_yamboly';

  it('usa postgres cuando hay DATABASE_URL', () => {
    const opciones = opcionesDataSource({ databaseUrl: URL_PG, dbPath: './data/mes.sqlite' });
    expect(opciones.type).toBe('postgres');
    expect(opciones).toMatchObject({ url: URL_PG, synchronize: true, logging: false });
  });

  it('DATABASE_URL manda sobre DB_PATH', () => {
    expect(opcionesDataSource({ databaseUrl: URL_PG, dbPath: ':memory:' })).not.toHaveProperty(
      'database',
      ':memory:',
    );
  });

  it('cae a sqlite cuando DATABASE_URL falta o viene vacía', () => {
    for (const databaseUrl of [undefined, null, '', '   ']) {
      const opciones = opcionesDataSource({ databaseUrl, dbPath: './data/mes.sqlite' });
      expect(opciones).toMatchObject({ type: 'sqlite', database: './data/mes.sqlite' });
    }
  });

  it('sin DB_PATH usa SQLite en memoria (e2e)', () => {
    expect(opcionesDataSource({})).toMatchObject({ type: 'sqlite', database: ':memory:' });
  });

  it('registra las 37 entidades en ambos motores', () => {
    expect(ENTITIES).toHaveLength(37);
    expect(opcionesDataSource({ databaseUrl: URL_PG }).entities).toBe(ENTITIES);
    expect(opcionesDataSource({ dbPath: ':memory:' }).entities).toBe(ENTITIES);
  });
});
