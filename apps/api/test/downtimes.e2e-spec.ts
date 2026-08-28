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
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-01',
        maquinaId: 'MAQ-01',
        causaId: 'CPA-PM-01-02',
        inicio: '2026-08-28T14:10:00',
        accionTomada: 'Se retiró el material atascado y se limpió la mordaza',
        responsableId: 'USR-07',
        tiempoRegistroSeg: 65,
      })
      .expect(201);

    expect(body).toMatchObject({
      ordenId: 'ORD-0814',
      causaCodigo: 'PM-01-02',
      tipoCausaCodigo: 'PM-01',
      lineaCodigo: 'L1',
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
        lineaId: 'LIN-01',
        maquinaId: 'MAQ-01',
        causaId: 'CPA-PM-01-02',
        inicio: '2026-08-28T15:00:00',
        accionTomada: 'corto',
        responsableId: 'USR-07',
      })
      .expect(422);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('exige el número de solicitud cuando la causa lo requiere (422)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-01',
        maquinaId: 'MAQ-01',
        causaId: 'CPA-PM-01-01',
        inicio: '2026-08-28T15:00:00',
        accionTomada: 'Se reemplazó la faja y se verificó tensión de rodillos',
        responsableId: 'USR-07',
      })
      .expect(422);

    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toHaveProperty('numeroSolicitud');
  });

  it('rechaza una causa inexistente con 422', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-01',
        maquinaId: 'MAQ-01',
        causaId: 'CPA-NO-EXISTE',
        inicio: '2026-08-28T15:00:00',
        accionTomada: 'Se corrigió la condición y se reinició la línea',
        responsableId: 'USR-07',
      })
      .expect(422);
  });

  it('registra en bitácora el cambio de causa al editar', async () => {
    const { body: editada } = await request(app.getHttpServer())
      .patch('/api/v1/paradas/PAR-0815-02')
      .set(auth())
      .send({ causaId: 'CPA-PO-06-02', motivoEdicion: 'Reclasificada tras revisión' })
      .expect(200);

    expect(editada.causaCodigo).toBe('PO-06-02');

    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/ORD-0815/bitacora?tipo=edicion')
      .set(auth())
      .expect(200);

    expect(body.data.some((e: { texto: string }) => e.texto.includes('PO-06-01 → PO-06-02'))).toBe(
      true,
    );
  });

  it('lista y descarta detecciones IoT', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/detecciones-iot?estado=sugerida')
      .set(auth())
      .expect(200);

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'IOT-L3-01', lineaCodigo: 'L3', minutos: 3 });

    const { body: descartada } = await request(app.getHttpServer())
      .post('/api/v1/detecciones-iot/IOT-L3-01/descartar')
      .set(auth())
      .expect(200);
    expect(descartada.estado).toBe('descartada');
  });
});
