import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, CREDENCIALES } from './app.factory';

describe('auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('inicia sesión con correo y devuelve el usuario sin contraseña', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(CREDENCIALES.jefe)
      .expect(200);

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user).toMatchObject({
      id: 'USR-01',
      nombre: 'Carlos Mendoza',
      email: 'jefe@yamboly.lat',
      rol: 'jefe',
    });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('acepta el DNI como identificador', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: '46012784', password: 'Yamboly2026' })
      .expect(200);

    expect(body.user).toMatchObject({ id: 'USR-02', rol: 'maquinista', lineaId: 'LIN-02' });
  });

  it('rechaza credenciales inválidas con 401 y el código UNAUTHORIZED', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'jefe@yamboly.lat', password: 'contrasena-mala' })
      .expect(401);

    expect(body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });

  it('protege /auth/me sin token', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('devuelve el perfil con token válido y cierra sesión con 204', async () => {
    const { body: sesion } = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(CREDENCIALES.maquinista)
      .expect(200);

    const { body: perfil } = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${sesion.accessToken}`)
      .expect(200);

    expect(perfil).toMatchObject({ id: 'USR-02', nombre: 'Jorge Quispe' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${sesion.accessToken}`)
      .expect(204);
  });
});
