import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, login } from './app.factory';

describe('ordenes (e2e)', () => {
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

  it('lista órdenes paginadas con la forma { data, meta }', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes?page=1&pageSize=10')
      .set(auth())
      .expect(200);

    expect(body.meta).toMatchObject({ page: 1, pageSize: 10, total: 60, totalPages: 6 });
    expect(body.data).toHaveLength(10);
    expect(body.data[0]).toHaveProperty('lineaCodigo');
    expect(body.data[0]).toHaveProperty('productoNombre');
  });

  it('filtra por línea, turno y estado', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes?lineaId=LIN-02&estado=por_validar&pageSize=100')
      .set(auth())
      .expect(200);

    expect(body.data.length).toBeGreaterThan(0);
    for (const orden of body.data) {
      expect(orden.lineaId).toBe('LIN-02');
      expect(orden.estado).toBe('por_validar');
    }
  });

  it('busca por código, lote o producto', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes?search=OF-2026-0815')
      .set(auth())
      .expect(200);

    expect(body.meta.total).toBe(1);
    expect(body.data[0].codigo).toBe('OF-2026-0815');
  });

  it('devuelve el resumen de las summary cards', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/resumen')
      .set(auth())
      .expect(200);

    expect(body).toMatchObject({ todas: 1248, porValidar: 12, conParadas: 37, conMermas: 21 });
  });

  it('devuelve el detalle de OF-2026-0815 con sus números', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/OF-2026-0815')
      .set(auth())
      .expect(200);

    expect(body).toMatchObject({
      id: 'ORD-0815',
      codigo: 'OF-2026-0815',
      lineaCodigo: 'L2',
      lineaNombre: 'Conos',
      productoNombre: 'Cono Vainilla 120 ml',
      maquinistaNombre: 'Jorge Quispe',
      supervisorNombre: 'Ana Ríos',
      lote: 'L-260828-02',
      planificado: 10000,
      producido: 9840,
      conteoCodificadora: 9653,
      estado: 'por_validar',
      paradasCount: 4,
      mermasKg: 5,
      operarios: 6,
    });
    expect(body.oee).toEqual({ oee: 81.3, disponibilidad: 92, desempeno: 90.1, calidad: 98.1 });
    expect(body.colaboradores).toHaveLength(6);
  });

  it('acepta el id además del código y responde 404 con NOT_FOUND si no existe', async () => {
    await request(app.getHttpServer()).get('/api/v1/ordenes/ORD-0815').set(auth()).expect(200);

    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/OF-2026-9999')
      .set(auth())
      .expect(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('devuelve las 4 paradas de la OF-2026-0815 con su resumen (42 min, 3 afectan OEE)', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/ORD-0815/paradas')
      .set(auth())
      .expect(200);

    expect(body.data).toHaveLength(4);
    expect(body.resumen).toEqual({ cantidad: 4, minutos: 42, afectanOee: 3 });
    expect(body.data[0]).toMatchObject({
      causaCodigo: 'PL-03-02',
      causaNombre: 'CIP entre sabores',
      maquinaNombre: 'Tolva de cobertura L2',
    });
  });

  it('devuelve mermas y velocidades de la orden', async () => {
    const { body: mermas } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/ORD-0815/mermas')
      .set(auth())
      .expect(200);
    expect(mermas.resumen).toEqual({ cantidad: 2, kg: 5 });

    const { body: velocidades } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/ORD-0815/velocidades')
      .set(auth())
      .expect(200);
    expect(velocidades.data[0]).toMatchObject({ velocidadReal: 118, desvioPct: -1.7 });
  });

  it('exige el checklist completo al validar (422) y escribe la bitácora al validar', async () => {
    const incompleto = await request(app.getHttpServer())
      .post('/api/v1/ordenes/ORD-0815/validar')
      .set(auth())
      .send({
        produccionRegistrada: true,
        paradasConCausa: false,
        mermasClasificadas: true,
        evidenciaEtiqueta: true,
      })
      .expect(422);
    expect(incompleto.body.code).toBe('VALIDATION_ERROR');

    const { body: validada } = await request(app.getHttpServer())
      .post('/api/v1/ordenes/ORD-0815/validar')
      .set(auth())
      .send({
        produccionRegistrada: true,
        paradasConCausa: true,
        mermasClasificadas: true,
        evidenciaEtiqueta: true,
        observacion: 'Revisada con el maquinista',
      })
      .expect(200);
    expect(validada.estado).toBe('validada');

    const { body: bitacora } = await request(app.getHttpServer())
      .get('/api/v1/ordenes/ORD-0815/bitacora?tipo=validacion')
      .set(auth())
      .expect(200);

    expect(bitacora.data.length).toBeGreaterThan(0);
    expect(bitacora.data[0]).toMatchObject({ tipo: 'validacion', usuario: 'Carlos Mendoza' });
    expect(bitacora.data[0].texto).toContain('validó y cerró la orden');

    /* Segunda validación: conflicto. */
    const repetida = await request(app.getHttpServer())
      .post('/api/v1/ordenes/ORD-0815/validar')
      .set(auth())
      .send({
        produccionRegistrada: true,
        paradasConCausa: true,
        mermasClasificadas: true,
        evidenciaEtiqueta: true,
      })
      .expect(409);
    expect(repetida.body.code).toBe('CONFLICT');
  });
});
