import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, CREDENCIALES, login } from './app.factory';

/**
 * Fotos de evidencia de las capturas de planta.
 *
 * Antes el asistente pedía la foto, la validaba en el navegador y la tiraba:
 * sólo viajaba `file.name`. Estos casos fijan que la foto se guarda de verdad,
 * que se puede recuperar y que la parada, la merma y la orden conservan su ruta.
 */
describe('evidencias (e2e)', () => {
  let app: INestApplication;
  let token: string;

  /* PNG de 1×1 píxel: el archivo más pequeño que supera el filtro de imagen. */
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  beforeAll(async () => {
    app = await crearApp();
    token = await login(app, CREDENCIALES.maquinista);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const subirFoto = async (): Promise<string> => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/evidencias')
      .set(auth())
      .attach('archivo', PNG_1X1, { filename: 'merma-envolvedora.png', contentType: 'image/png' })
      .expect(201);
    return body.url as string;
  };

  it('guarda la foto y devuelve la ruta con la que se referencia', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/evidencias')
      .set(auth())
      .attach('archivo', PNG_1X1, { filename: 'parada.png', contentType: 'image/png' })
      .expect(201);

    expect(body).toMatchObject({ nombreOriginal: 'parada.png', bytes: PNG_1X1.length });
    /* El nombre en disco lo pone el servidor, nunca el cliente. */
    expect(body.nombre).toMatch(/^EV-\d{8}-[0-9a-f]{8}\.png$/);
    expect(body.url).toBe(`/api/v1/evidencias/${body.nombre}`);
  });

  it('devuelve la foto guardada con su tipo de imagen', async () => {
    const url = await subirFoto();
    const respuesta = await request(app.getHttpServer()).get(url).set(auth()).expect(200);

    expect(respuesta.headers['content-type']).toContain('image/png');
    expect(Buffer.from(respuesta.body as Buffer)).toEqual(PNG_1X1);
  });

  it('rechaza lo que no es una imagen (422)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/evidencias')
      .set(auth())
      .attach('archivo', Buffer.from('col1,col2\n1,2\n'), {
        filename: 'datos.csv',
        contentType: 'text/csv',
      })
      .expect(422);
  });

  it('404 si la foto no existe, incluso intentando salir de la carpeta', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/evidencias/EV-20260101-deadbeef.png')
      .set(auth())
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/evidencias/..%2F..%2Fpackage.json')
      .set(auth())
      .expect(404);
  });

  it('la merma conserva la foto en `evidenciaUrl`', async () => {
    const evidenciaUrl = await subirFoto();
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/mermas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        tipo: 'EP',
        cantidadKg: 1.8,
        sabor: 'Chocolate',
        tipoCausaId: 'CME-MP-01',
        causaId: 'CME-MP-01-01',
        responsableId: 'USR-04',
        evidenciaUrl,
        tiempoRegistroSeg: 48,
      })
      .expect(201);

    expect(body.evidenciaUrl).toBe(evidenciaUrl);

    /* Y sigue ahí al releer la orden, no sólo en la respuesta del alta. */
    const listado = await request(app.getHttpServer())
      .get('/api/v1/ordenes/ORD-0814/mermas')
      .set(auth())
      .expect(200);
    const guardada = listado.body.data.find((m: { id: string }) => m.id === body.id);
    expect(guardada.evidenciaUrl).toBe(evidenciaUrl);
  });

  it('la parada conserva la foto en `evidenciaUrl`', async () => {
    const evidenciaUrl = await subirFoto();
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/paradas')
      .set(auth())
      .send({
        ordenId: 'ORD-0814',
        lineaId: 'LIN-LLEN-M2',
        causaId: 'CPA-PN-04-02',
        inicio: '2026-08-28T15:10:00',
        accionTomada: 'Se fotografió el atasco antes de liberar la mordaza',
        responsableId: 'USR-07',
        evidenciaUrl,
        tiempoRegistroSeg: 70,
      })
      .expect(201);

    expect(body.evidenciaUrl).toBe(evidenciaUrl);
  });
});
