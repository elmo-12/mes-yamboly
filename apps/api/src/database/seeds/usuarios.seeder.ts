import { hashSync } from 'bcryptjs';
import type { DataSource } from 'typeorm';
import { User } from '../entities';
import { usuarios } from './data';
import type { Seeder } from './seeder.interface';

/** Coste bajo a propósito: el seed inserta 11 usuarios en cada arranque en frío. */
const BCRYPT_ROUNDS = 10;

export const usuariosSeeder: Seeder = {
  name: 'usuarios',
  async run(dataSource: DataSource): Promise<void> {
    const filas = usuarios.map(({ password, lineaId, avatarUrl, ...user }) => ({
      ...user,
      lineaId: lineaId ?? null,
      avatarUrl: avatarUrl ?? null,
      passwordHash: hashSync(password, BCRYPT_ROUNDS),
    }));
    await dataSource.getRepository(User).save(filas);
  },
};
