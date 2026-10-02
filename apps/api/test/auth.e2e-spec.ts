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

    expect(body.user).toMatchObject({ id: 'USR-02', rol: 'maquinista', lineaId: 'LIN-EXTR-2' });
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

  describe('límite por IP con trust proxy', () => {
    const fallo = (a: INestApplication, xff?: string) => {
      const r = request(a.getHttpServer()).post('/api/v1/auth/login');
      if (xff) r.set('X-Forwarded-For', xff);
      return r.send({ email: `nadie-${Math.random()}@x.lat`, password: 'mala-clave-1' });
    };

    it('con 1 salto de confianza una XFF rotativa no evita el bloqueo por IP', async () => {
      const a = await crearApp();
      a.getHttpAdapter().getInstance().set('trust proxy', 1);
      try {
        let estado = 0;
        for (let i = 0; i < 25; i++) estado = (await fallo(a, `10.9.${i}.1, 203.0.113.7`)).status;
        expect(estado).toBe(429);
      } finally {
        await a.close();
      }
    });

    it('con saltos de confianza y sin X-Forwarded-For no limita por IP', async () => {
      const a = await crearApp();
      a.getHttpAdapter().getInstance().set('trust proxy', 1);
      try {
        let estado = 0;
        for (let i = 0; i < 25; i++) estado = (await fallo(a)).status;
        expect(estado).toBe(401);
      } finally {
        await a.close();
      }
    });
  });
});
