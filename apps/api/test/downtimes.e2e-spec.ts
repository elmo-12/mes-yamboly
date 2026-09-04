import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, CREDENCIALES, login } from './app.factory';

describe('paradas y detecciones IoT (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await crearApp();
    token = await login(app, CREDENCIALES.maquinista);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('crea una parada (201) y la deja abierta', async () => {
    /* ORD-0814 corre en la Llenadora M2. */
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        causaId: 'CPA-PN-04-02',
        inicio: '2026-08-28T14:10:00',
        accionTomada: 'Se retiró el material atascado y se limpió la mordaza',
        responsableId: 'USR-07',
        tiempoRegistroSeg: 65,
      })
      .expect(201);

    expect(body).toMatchObject({
      ordenId: 'ORD-0814',
      causaCodigo: 'PN-04-02',
      tipoCausaCodigo: 'PN-04',
      lineaCodigo: 'LLEN-M2',
      origen: 'manual',
      fin: null,
    });
    expect(body.responsableNombre).toBe('Luis Vargas');

    const { body: cerrada } = await request(app.getHttpServer())
      .post(`/api/v1/paradas/${body.id}/finalizar`)
      .set(auth())
      .send({ fin: '2026-08-28T14:22:00', comentarioCierre: 'Línea reiniciada' })
      .expect(200);
    expect(cerrada.duracionMin).toBe(12);

    await request(app.getHttpServer())
      .post(`/api/v1/paradas/${body.id}/finalizar`)
      .set(auth())
      .send({ fin: '2026-08-28T14:30:00' })
      .expect(409);
  });

  it('rechaza la parada sin acción tomada suficiente (422 vía ValidationPipe)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        causaId: 'CPA-PN-04-02',
        inicio: '2026-08-28T15:00:00',
        accionTomada: 'corto',
        responsableId: 'USR-07',
      })
      .expect(422);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  /**
   * Ninguna de las 83 causas de parada del maestro real trae
   * `requiereSolicitud: true` (esa exigencia se movió al árbol de causas de
   * merma — ver el caso homónimo en `realtime.e2e-spec.ts`), así que la rama
   * de `numeroSolicitud` de `DowntimesService.crear` ya no es alcanzable
   * desde datos reales. Se reutiliza el slot del test para cubrir la otra
   * validación de negocio de la misma línea (línea inexistente: la parada se
   * registra hasta la línea, ya no existe el nivel máquina).
   */
  it('rechaza una línea inexistente con 422', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-NO-EXISTE',
        causaId: 'CPA-PN-04-02',
        inicio: '2026-08-28T15:00:00',
        accionTomada: 'Se reemplazó la faja y se verificó tensión de rodillos',
        responsableId: 'USR-07',
      })
      .expect(422);

    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toHaveProperty('lineaId');
  });

  it('rechaza una causa inexistente con 422', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        causaId: 'CPA-NO-EXISTE',
        inicio: '2026-08-28T15:00:00',
        accionTomada: 'Se corrigió la condición y se reinició la línea',
        responsableId: 'USR-07',
      })
      .expect(422);
  });

  it('registra en bitácora el cambio de causa al editar', async () => {
    /* PAR-0815-02 nace con causaId CPA-PN-04-01 (PN-04-01) en el seed. */
    const { body: editada } = await request(app.getHttpServer())
      .patch('/api/v1/paradas/PAR-0815-02')
      .set(auth())
      .send({ causaId: 'CPA-PP-01-01', motivoEdicion: 'Reclasificada tras revisión' })
      .expect(200);

    expect(editada.causaCodigo).toBe('PP-01-01');

    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/ORD-0815/bitacora?tipo=edicion')
      .set(auth())
      .expect(200);

    expect(body.data.some((e: { texto: string }) => e.texto.includes('PN-04-01 → PP-01-01'))).toBe(
      true,
    );
  });

  it('lista y descarta detecciones IoT', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/detecciones-iot?estado=sugerida')
      .set(auth())
      .expect(200);

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'IOT-EXTR2-01', lineaCodigo: 'EXTR-2', minutos: 3 });

    const { body: descartada } = await request(app.getHttpServer())
      .post('/api/v1/detecciones-iot/IOT-EXTR2-01/descartar')
      .set(auth())
      .expect(200);
    expect(descartada.estado).toBe('descartada');
  });
});
