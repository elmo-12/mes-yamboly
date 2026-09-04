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

  it('devuelve el árbol de causas con 5 tipos raíz', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/causas-parada')
      .set(auth())
      .expect(200);

    expect(body.data).toHaveLength(5);
    expect(body.data[0]).toHaveProperty('hijos');
  });

  it('devuelve el listado plano con formato=plano', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/causas-parada?formato=plano')
      .set(auth())
      .expect(200);

    /* 5 tipos + 26 generales + 52 específicas (árbol TT-GG-EE real). */
    expect(body.data).toHaveLength(83);
    expect(body.data[0]).not.toHaveProperty('hijos');
  });

  it('da de baja una causa conservando su histórico', async () => {
    const { body } = await request(app.getHttpServer())
      .delete('/api/v1/causas-parada/CPA-PS-05-02')
      .set(auth())
      .expect(200);

    expect(body).toMatchObject({ codigo: 'PS-05-02', estado: 'inactivo' });
    expect(body.paradasConservadas).toBeGreaterThan(0);
    expect(body.mensaje).toContain('se conservarán con el código');
  });

  /**
   * BUGs reales de la API detectados y corregidos durante esta oleada (ver
   * informe):
   * 1. `RealtimeController`/`RealtimeService` usaban `sedeId ?? 'SED-01'`
   *    como sede por defecto, pero la única sede real del seed es
   *    `SED-LIMA`; sin `?sedeId=` explícito `/tiempo-real/lineas` y
   *    `/tiempo-real/tv` devolvían `lineas`/`filas` vacíos.
   * 2. Las líneas nunca llegaban a `parada`/`produciendo`/`alerta` porque
   *    `RealtimeService.contexto()` comparaba `orden.fecha` con `hoyIso()`
   *    (reloj real) mientras el seed fija `HOY = '2026-08-28'`
   *    (`seeds/data/seed.ts`). Corregido con el "día operativo"
   *    (`diaOperativo` en `common/utils/query.ts`), robusto a la fecha real
   *    del servidor.
   */
  it('lista las 9 líneas y sus estados calculados', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/tiempo-real/lineas')
      .set(auth())
      .expect(200);

    expect(body.lineas).toHaveLength(9);
    expect(body.sedeId).toBe('SED-LIMA');
    const porCodigo = Object.fromEntries(
      body.lineas.map((l: { lineaCodigo: string; estado: string }) => [l.lineaCodigo, l.estado]),
    );
    /* La Moldeadora A3 tiene una parada abierta (PAR-0812-01, spec 03.A). */
    expect(porCodigo['MOLD-A3']).toBe('parada');
    /* La Llenadora A2 queda explícitamente sin orden del turno Día. */
    expect(porCodigo['LLEN-A2']).toBe('sin_orden');
    /* La Extrusora 2 tiene una detección IoT sugerida (IOT-EXTR2-01, spec 03.A · paridad con el mock web). */
    expect(porCodigo['EXTR-2']).toBe('sugerida');
  });

  it('devuelve el timeline de una línea y 404 si no existe', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/tiempo-real/lineas/LIN-LLEN-A1/timeline')
      .set(auth())
      .expect(200);

    expect(body.lineaCodigo).toBe('LLEN-A1');
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

    expect(body.filas).toHaveLength(9);
    expect(body.filas[0]).toHaveProperty('avancePct');
    expect(body.filas[0]).toHaveProperty('estadoLabel');
  });

  it('registra una velocidad con el desvío calculado', async () => {
    /* ORD-0814 corre en la Llenadora M2 con el par PRD-1110001 × LIN-LLEN-M2
     * (VE-0002, 8 u/min de estándar). */
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/velocidades')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        velocidadReal: 7.6,
        responsableId: 'USR-07',
        tiempoRegistroSeg: 38,
      })
      .expect(201);

    expect(body).toMatchObject({ velocidadEstandar: 8, desvioPct: -5, ordenCodigo: 'OF-2026-0814' });
  });

  it('registra una merma y rechaza cantidades no positivas', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        tipo: 'EP',
        cantidadKg: 2.5,
        sabor: 'Chocolate',
        tipoCausaId: 'CME-MP-01',
        causaId: 'CME-MP-01-01',
        responsableId: 'USR-04',
        tiempoRegistroSeg: 52,
      })
      .expect(201);

    expect(body).toMatchObject({ causaCodigo: 'MP-01-01', causaNombre: 'Arranque', lineaCodigo: 'LLEN-M2' });

    await request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        tipo: 'EP',
        cantidadKg: 0,
        sabor: 'Chocolate',
        tipoCausaId: 'CME-MP-01',
        causaId: 'CME-MP-01-01',
        responsableId: 'USR-04',
      })
      .expect(422);
  });

  it('exige el número de solicitud cuando la causa de merma lo requiere (422)', async () => {
    /* MP-04-01 «Falla palera» exige N.º de solicitud en el árbol real. */
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        tipo: 'EP',
        cantidadKg: 1.2,
        sabor: 'Chocolate',
        tipoCausaId: 'CME-MP-04',
        causaId: 'CME-MP-04-01',
        responsableId: 'USR-04',
        tiempoRegistroSeg: 40,
      })
      .expect(422);

    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toHaveProperty('numeroSolicitud');
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
      .get('/api/v1/usuarios?rol=maquinista&rol=supervisor&lineaId=LIN-EXTR-2')
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
    expect(body.data[0]).toMatchObject({ id: 'COL-01', iniciales: 'KP' });
  });
});
