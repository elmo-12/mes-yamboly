import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, login } from './app.factory';

describe('tiempo real y catálogos (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await crearApp();
    token = await login(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('devuelve el árbol de causas con 7 tipos raíz', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/causas-parada')
      .set(auth())
      .expect(200);

    expect(body.data).toHaveLength(7);
    expect(body.data[0]).toHaveProperty('hijos');
  });

  it('devuelve el listado plano con formato=plano', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/causas-parada?formato=plano')
      .set(auth())
      .expect(200);

    /* 7 tipos + 14 generales + 24 específicas. */
    expect(body.data).toHaveLength(45);
    expect(body.data[0]).not.toHaveProperty('hijos');
  });

  it('da de baja una causa conservando su histórico', async () => {
    const { body } = await request(app.getHttpServer())
      .delete('/api/v1/causas-parada/CPA-PS-07-02')
      .set(auth())
      .expect(200);

    expect(body).toMatchObject({ codigo: 'PS-07-02', estado: 'inactivo' });
    expect(body.paradasConservadas).toBeGreaterThan(0);
    expect(body.mensaje).toContain('se conservarán con el código');
  });

  it('lista las 6 líneas y sus estados calculados', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/tiempo-real/lineas')
      .set(auth())
      .expect(200);

    expect(body.lineas).toHaveLength(6);
    expect(body.sedeId).toBe('SED-01');
    const porCodigo = Object.fromEntries(
      body.lineas.map((l: { lineaCodigo: string; estado: string }) => [l.lineaCodigo, l.estado]),
    );
    expect(porCodigo.L4).toBe('parada');
    expect(porCodigo.L5).toBe('sin_orden');
    expect(['produciendo', 'alerta']).toContain(porCodigo.L1);
  });

  it('devuelve el timeline de una línea y 404 si no existe', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/tiempo-real/lineas/LIN-02/timeline')
      .set(auth())
      .expect(200);

    expect(body.lineaCodigo).toBe('L2');
    expect(body.eventos.length).toBeGreaterThan(0);
    expect(body.eventos[0].tipo).toBe('inicio_of');

    await request(app.getHttpServer())
      .get('/api/v1/tiempo-real/lineas/LIN-99/timeline')
      .set(auth())
      .expect(404);
  });

  it('devuelve el tablero TV con avance por línea', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/tiempo-real/tv')
      .set(auth())
      .expect(200);

    expect(body.filas).toHaveLength(6);
    expect(body.filas[0]).toHaveProperty('avancePct');
    expect(body.filas[0]).toHaveProperty('estadoLabel');
  });

  it('registra una velocidad con el desvío calculado', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/velocidades')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-01',
        velocidadReal: 90,
        responsableId: 'USR-07',
        tiempoRegistroSeg: 38,
      })
      .expect(201);

    expect(body).toMatchObject({ velocidadEstandar: 95, desvioPct: -5.3, ordenCodigo: 'OF-2026-0814' });
  });

  it('registra una merma y rechaza cantidades no positivas', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-01',
        tipo: 'EP',
        cantidadKg: 2.5,
        sabor: 'Chocolate',
        causaId: 'CME-MR-03',
        responsableId: 'USR-04',
        tiempoRegistroSeg: 52,
      })
      .expect(201);

    expect(body).toMatchObject({ causaCodigo: 'MR-03', causaNombre: 'Arranque', lineaCodigo: 'L1' });

    await request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-01',
        tipo: 'EP',
        cantidadKg: 0,
        sabor: 'Chocolate',
        causaId: 'CME-MR-03',
        responsableId: 'USR-04',
      })
      .expect(422);
  });

  it('sirve el directorio de personas a cualquier rol autenticado', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/usuarios')
      .set(auth())
      .expect(200);
    expect(body.data).toHaveLength(11);

    const maquinista = await login(app, {
      email: 'jorge.quispe@yamboly.lat',
      password: 'Yamboly2026',
    });
    const { body: filtrado } = await request(app.getHttpServer())
      .get('/api/v1/usuarios?rol=maquinista&rol=supervisor&lineaId=LIN-02')
      .set({ Authorization: `Bearer ${maquinista}` })
      .expect(200);
    expect(filtrado.data.map((u: { id: string }) => u.id)).toContain('USR-02');
    expect(filtrado.data.every((u: { rol: string }) => ['maquinista', 'supervisor'].includes(u.rol))).toBe(true);
  });

  it('expone la cuadrilla del turno en /colaboradores', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/colaboradores')
      .set(auth())
      .expect(200);
    expect(body.data).toHaveLength(6);
    expect(body.data[0]).toMatchObject({ id: 'COL-01', iniciales: 'RH' });
  });
});
