import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, CREDENCIALES, login } from './app.factory';

/** Mantenedor de usuarios (11 del seed real, todos en `SED-LIMA`). */
describe('usuarios (e2e)', () => {
  let app: INestApplication;
  let jefeToken: string;
  let supervisorToken: string;
  let maquinistaToken: string;

  beforeAll(async () => {
    app = await crearApp();
    jefeToken = await login(app, CREDENCIALES.jefe);
    supervisorToken = await login(app, { email: 'ana.rios@yamboly.lat', password: 'Yamboly2026' });
    maquinistaToken = await login(app, CREDENCIALES.maquinista);
  });

  afterAll(async () => {
    await app.close();
  });

  const jefe = () => ({ Authorization: `Bearer ${jefeToken}` });
  const supervisor = () => ({ Authorization: `Bearer ${supervisorToken}` });
  const maquinista = () => ({ Authorization: `Bearer ${maquinistaToken}` });
  const server = () => app.getHttpServer();

  const NUEVO_USUARIO = {
    nombre: 'Patricia Solano',
    email: 'patricia.solano@yamboly.lat',
    dni: '99988877',
    rol: 'calidad',
    cargo: 'Analista de calidad e2e',
    sedeId: 'SED-LIMA',
    password: 'ClaveTest2026',
  };
  let nuevoUsuarioId: string;

  /* ------------------------------------------------------------------ */
  /* Listado y filtros (antes de cualquier mutación)                    */
  /* ------------------------------------------------------------------ */

  describe('listado', () => {
    it('lista los 11 usuarios del seed', async () => {
      const { body } = await request(server()).get('/api/v1/usuarios').set(jefe()).expect(200);
      expect(body.data).toHaveLength(11);
    });

    it('?activo=false está vacío al inicio (nadie ha sido desactivado)', async () => {
      const { body } = await request(server())
        .get('/api/v1/usuarios?activo=false')
        .set(jefe())
        .expect(200);
      expect(body.data).toHaveLength(0);
    });

    it('?rol=maquinista filtra los 5 maquinistas del seed', async () => {
      const { body } = await request(server())
        .get('/api/v1/usuarios?rol=maquinista')
        .set(jefe())
        .expect(200);
      expect(body.data).toHaveLength(5);
      expect(body.data.every((u: { rol: string }) => u.rol === 'maquinista')).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Alta de usuario                                                    */
  /* ------------------------------------------------------------------ */

  describe('alta de usuario', () => {
    it('el jefe crea un usuario: respuesta sin passwordHash e iniciales derivadas', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios')
        .set(jefe())
        .send(NUEVO_USUARIO)
        .expect(201);

      expect(body).toMatchObject({
        id: 'USR-12',
        nombre: 'Patricia Solano',
        email: 'patricia.solano@yamboly.lat',
        rol: 'calidad',
        iniciales: 'PS',
        activo: true,
      });
      expect(body).not.toHaveProperty('passwordHash');
      expect(body).not.toHaveProperty('password');
      nuevoUsuarioId = body.id;
    });

    it('409 al repetir el correo de un usuario existente', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios')
        .set(jefe())
        .send({ ...NUEVO_USUARIO, email: CREDENCIALES.jefe.email, dni: '99988866' })
        .expect(409);
      expect(body.code).toBe('CONFLICT');
    });

    it('409 al repetir el DNI de un usuario existente', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios')
        .set(jefe())
        .send({ ...NUEVO_USUARIO, email: 'otro.correo@yamboly.lat', dni: '41285630' })
        .expect(409);
      expect(body.code).toBe('CONFLICT');
    });

    it('422 si el DNI no tiene 8 dígitos', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios')
        .set(jefe())
        .send({ ...NUEVO_USUARIO, email: 'otro2@yamboly.lat', dni: '12345' })
        .expect(422);
      expect(body.details).toHaveProperty('dni');
    });

    it('422 si la contraseña es demasiado corta', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios')
        .set(jefe())
        .send({ ...NUEVO_USUARIO, email: 'otro3@yamboly.lat', dni: '99911122', password: 'corta1' })
        .expect(422);
      expect(body.details).toHaveProperty('password');
    });

    it('403 si un supervisor intenta crear un usuario', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios')
        .set(supervisor())
        .send({ ...NUEVO_USUARIO, email: 'otro4@yamboly.lat', dni: '99911133' })
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('403 si un maquinista intenta crear un usuario', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios')
        .set(maquinista())
        .send({ ...NUEVO_USUARIO, email: 'otro5@yamboly.lat', dni: '99911144' })
        .expect(403);
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  /* ------------------------------------------------------------------ */
  /* Login del usuario nuevo                                            */
  /* ------------------------------------------------------------------ */

  describe('login del usuario nuevo', () => {
    it('inicia sesión con la contraseña de alta y /auth/me refleja sus datos', async () => {
      const { body: sesion } = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: NUEVO_USUARIO.email, password: NUEVO_USUARIO.password })
        .expect(200);
      expect(sesion.user).toMatchObject({ id: 'USR-12', rol: 'calidad' });

      const { body: perfil } = await request(server())
        .get('/api/v1/auth/me')
        .set({ Authorization: `Bearer ${sesion.accessToken}` })
        .expect(200);
      expect(perfil).toMatchObject({ id: 'USR-12', nombre: 'Patricia Solano', email: NUEVO_USUARIO.email });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Edición                                                             */
  /* ------------------------------------------------------------------ */

  describe('edición de usuario', () => {
    it('el jefe edita rol, sede, línea y cargo', async () => {
      const { body } = await request(server())
        .patch(`/api/v1/usuarios/${nuevoUsuarioId}`)
        .set(jefe())
        .send({
          rol: 'supervisor',
          sedeId: 'SED-AREQUIPA',
          lineaId: 'LIN-LLEN-M2',
          cargo: 'Supervisora de turno e2e',
        })
        .expect(200);
      expect(body).toMatchObject({
        rol: 'supervisor',
        sedeId: 'SED-AREQUIPA',
        lineaId: 'LIN-LLEN-M2',
        cargo: 'Supervisora de turno e2e',
      });
    });

    /**
     * `UpdateUsuarioDto` no declara `password`: con `whitelist: true` el pipe
     * global descarta el campo silenciosamente (200, sin tocar la contraseña)
     * en lugar de devolver 422. Documentamos el comportamiento real.
     */
    it('PATCH no acepta password: el campo se descarta y la contraseña no cambia', async () => {
      const { body, status } = await request(server())
        .patch(`/api/v1/usuarios/${nuevoUsuarioId}`)
        .set(jefe())
        .send({ cargo: 'Supervisora de turno e2e (editado)', password: 'IgnoradaClave123' });

      expect(status).toBe(200);
      expect(body.cargo).toBe('Supervisora de turno e2e (editado)');
      expect(body).not.toHaveProperty('password');

      /* La contraseña de alta sigue siendo válida. */
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: NUEVO_USUARIO.email, password: NUEVO_USUARIO.password })
        .expect(200);

      /* La contraseña "editada" por PATCH nunca se aplicó. */
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: NUEVO_USUARIO.email, password: 'IgnoradaClave123' })
        .expect(401);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Estado (activar/desactivar)                                        */
  /* ------------------------------------------------------------------ */

  describe('estado del usuario', () => {
    it('el jefe no puede desactivar su propia cuenta (422 BUSINESS_RULE)', async () => {
      const { body } = await request(server())
        .post('/api/v1/usuarios/USR-01/estado')
        .set(jefe())
        .send({ activo: false })
        .expect(422);
      expect(body.code).toBe('BUSINESS_RULE');
    });

    it('desactivar un usuario le impide iniciar sesión (401)', async () => {
      const { body } = await request(server())
        .post(`/api/v1/usuarios/${nuevoUsuarioId}/estado`)
        .set(jefe())
        .send({ activo: false })
        .expect(200);
      expect(body.activo).toBe(false);

      const { body: error } = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: NUEVO_USUARIO.email, password: NUEVO_USUARIO.password })
        .expect(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });

    it('reactivar el usuario le vuelve a permitir iniciar sesión', async () => {
      const { body } = await request(server())
        .post(`/api/v1/usuarios/${nuevoUsuarioId}/estado`)
        .set(jefe())
        .send({ activo: true })
        .expect(200);
      expect(body.activo).toBe(true);

      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: NUEVO_USUARIO.email, password: NUEVO_USUARIO.password })
        .expect(200);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Restablecer contraseña                                             */
  /* ------------------------------------------------------------------ */

  describe('restablecer contraseña', () => {
    const NUEVA_CLAVE = 'ClaveNueva2026';

    it('restablece la contraseña: la nueva funciona y la anterior deja de servir', async () => {
      const { body } = await request(server())
        .post(`/api/v1/usuarios/${nuevoUsuarioId}/restablecer-password`)
        .set(jefe())
        .send({ password: NUEVA_CLAVE })
        .expect(200);
      expect(body).not.toHaveProperty('passwordHash');

      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: NUEVO_USUARIO.email, password: NUEVA_CLAVE })
        .expect(200);

      const { body: error } = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: NUEVO_USUARIO.email, password: NUEVO_USUARIO.password })
        .expect(401);
      expect(error.code).toBe('UNAUTHORIZED');
    });
  });
});
