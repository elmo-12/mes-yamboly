import type { Repository } from 'typeorm';
import { insertarConIdSecuencial } from './ids';

/** Repo simulado que imita a TypeORM en Postgres: serializa `simple-json` en el objeto recibido. */
function repoPostgresSimulado(): Repository<{ id: string; datos: string[] }> {
  return {
    count: async () => 0,
    insert: async (e: { datos: unknown }) => {
      e.datos = JSON.stringify(e.datos);
    },
  } as never;
}

describe('insertarConIdSecuencial', () => {
  it('no deja las columnas simple-json serializadas en la entidad devuelta', async () => {
    const entidad = { id: '', datos: ['LIN-X'] };
    const resultado = await insertarConIdSecuencial(repoPostgresSimulado(), entidad, (n) => `T-${n}`);
    expect(resultado.id).toBe('T-1');
    expect(resultado.datos).toEqual(['LIN-X']);
  });
});
