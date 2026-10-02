import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TIEMPO_REGISTRO_MAX_SEG } from '@mes/types';
import { crearApp, login } from './app.factory';

/**
 * Regresiones del QA de captura en planta (paradas, mermas, velocidades,
 * detecciones IoT y fotos de evidencia). Cada `describe` cita el bug del
 * informe de QA que fija.
 */
describe('captura en planta · regresiones QA (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const tokens: Record<string, string> = {};

  const PASS = 'Yamboly2026';
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  beforeAll(async () => {
    app = await crearApp();
    ds = app.get(DataSource);
    const cuentas: Record<string, string> = {
      jefe: 'jefe@yamboly.lat',
      supervisor: 'ana.rios@yamboly.lat',
      luis: 'luis.vargas@yamboly.lat', // maquinista LLEN-M2 (ORD-0814)
      jorge: 'jorge.quispe@yamboly.lat', // maquinista EXTR-2 (ORD-0811)
      mermas: 'maria.torres@yamboly.lat',
      calidad: 'rosa.huaman@yamboly.lat',
      investigador: 'investigador@yamboly.lat',
    };
    for (const [clave, email] of Object.entries(cuentas)) {
      tokens[clave] = await login(app, { email, password: PASS });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const como = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const http = () => request(app.getHttpServer());

  const parada = (extra: Record<string, unknown> = {}) => ({
    ordenId: 'ORD-0814',
    lineaId: 'LIN-LLEN-M2',
    causaId: 'CPA-PN-04-02',
    inicio: '2026-08-28T09:00:00',
    fin: '2026-08-28T09:05:00',
    accionTomada: 'Se liberó la mordaza y se reinició la línea',
    responsableId: 'USR-07',
    tiempoRegistroSeg: 30,
    ...extra,
  });
  const merma = (extra: Record<string, unknown> = {}) => ({
    ordenId: 'ORD-0814',
    lineaId: 'LIN-LLEN-M2',
    tipo: 'EP',
    cantidadKg: 1.5,
    sabor: 'Chocolate',
    causaId: 'CME-MP-01-01',
    responsableId: 'USR-04',
    tiempoRegistroSeg: 20,
    ...extra,
  });
  const velocidad = (extra: Record<string, unknown> = {}) => ({
    ordenId: 'ORD-0814',
    lineaId: 'LIN-LLEN-M2',
    velocidadReal: 7.5,
    responsableId: 'USR-07',
    tiempoRegistroSeg: 10,
    ...extra,
  });
  const subirFoto = (quien: string, buffer = PNG_1X1, filename = 'foto.png') =>
    http().post('/api/v1/evidencias').set(como(quien)).attach('archivo', buffer, { filename, contentType: 'image/png' });

  /* Ventanas horarias distintas por caso: no puede haber solapes entre tests. */
  let minuto = 0;
  const franja = () => {
    const base = 7 * 60 + minuto;
    minuto += 3;
    const h = (m: number) => `2026-08-28T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
    return { inicio: h(base), fin: h(base + 2) };
  };

  describe('C1 · órdenes cerradas y línea de la orden', () => {
    let validada: { id: string; lineaId: string; inicio: string };

    beforeAll(async () => {
      const { body } = await http()
        .get('/api/v1/ordenes?estado=validada&pageSize=1')
        .set(como('jefe'))
        .expect(200);
      validada = body.data[0];
    });

    it('409 al registrar parada, merma o velocidad en una orden validada', async () => {
      const base = { ordenId: validada.id, lineaId: validada.lineaId };
      await http().post('/api/v1/paradas').set(como('jefe')).send(parada({ ...base, inicio: validada.inicio, fin: undefined })).expect(409);
      await http().post('/api/v1/mermas').set(como('jefe')).send(merma(base)).expect(409);
      await http().post('/api/v1/velocidades').set(como('jefe')).send(velocidad(base)).expect(409);
    });

    it('orden por validar: el maquinista no corrige (403); el supervisor sí', async () => {
      /* ORD-0815 (LLEN-A1) está por validar; su maquinista es Luis Vargas. */
      await http()
        .patch('/api/v1/paradas/PAR-0815-02')
        .set(como('luis'))
        .send({ accionTomada: 'Corrección del maquinista tras el cierre' })
        .expect(403);
      await http()
        .patch('/api/v1/paradas/PAR-0815-02')
        .set(como('supervisor'))
        .send({ accionTomada: 'Corrección del supervisor tras el cierre' })
        .expect(200);
    });

    it('422 si la línea enviada no es la de la orden', async () => {
      const { body } = await http()
        .post('/api/v1/mermas')
        .set(como('jefe'))
        .send(merma({ lineaId: 'LIN-MOLD-A4' }))
        .expect(422);
      expect(body.details).toHaveProperty('lineaId');
      await http().post('/api/v1/velocidades').set(como('jefe')).send(velocidad({ lineaId: 'LIN-EXTR-2' })).expect(422);
    });
  });

  describe('C2 · inicio malformado', () => {
    it('422 (no 201) con inicio basura o de calendario imposible, y /lineas sigue en 200', async () => {
      for (const inicio of ['abc', '14:05', '2026-02-31T10:00:00', '2026-08-28T25:00:00', '2026-08-28T10:00:00Z']) {
        const { body } = await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio, fin: undefined })).expect(422);
        expect(body.details).toHaveProperty('inicio');
      }
      await http().get('/api/v1/lineas').set(como('jefe')).expect(200);
    });
  });

  describe('A1 · roles y línea', () => {
    it('investigador y calidad no registran paradas ni velocidades (403)', async () => {
      await http().post('/api/v1/paradas').set(como('investigador')).send(parada(franja())).expect(403);
      await http().post('/api/v1/velocidades').set(como('calidad')).send(velocidad()).expect(403);
      await http().post('/api/v1/mermas').set(como('investigador')).send(merma()).expect(403);
      await subirFoto('investigador').expect(403);
    });

    it('un maquinista no registra en otra línea (403)', async () => {
      await http().post('/api/v1/paradas').set(como('jorge')).send(parada(franja())).expect(403);
      await http().post('/api/v1/mermas').set(como('jorge')).send(merma()).expect(403);
      await http().post('/api/v1/velocidades').set(como('jorge')).send(velocidad()).expect(403);
    });

    it('mermas y calidad sí registran mermas', async () => {
      await http().post('/api/v1/mermas').set(como('mermas')).send(merma()).expect(201);
      await http().post('/api/v1/mermas').set(como('calidad')).send(merma({ responsableId: 'USR-06' })).expect(201);
    });

    it('un maquinista no confirma ni descarta detecciones de otra línea (403)', async () => {
      await http().post('/api/v1/detecciones-iot/IOT-EXTR2-01/descartar').set(como('luis')).expect(403);
    });
  });

  describe('A3 · ids sin carrera', () => {
    it('4 altas simultáneas → 4 × 201 con ids distintos', async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 4 }, () => http().post('/api/v1/velocidades').set(como('luis')).send(velocidad())),
      );
      expect(respuestas.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(new Set(respuestas.map((r) => r.body.id)).size).toBe(4);
      respuestas.forEach((r) => expect(r.body.id).toMatch(/^VEL-0814-N\d+$/));
    });
  });

  describe('A4 / A6 · horas y solapes de paradas', () => {
    it('una sola parada abierta por línea (409) y ningún solape (409)', async () => {
      const { body: abierta } = await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ inicio: '2026-08-28T10:00:00', fin: undefined }))
        .expect(201);
      await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T10:30:00', fin: undefined })).expect(409);
      /* Una retroactiva que empieza después de la abierta queda cubierta por ella. */
      await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T10:10:00', fin: '2026-08-28T10:12:00' })).expect(409);
      await http().post(`/api/v1/paradas/${abierta.id}/finalizar`).set(como('luis')).send({ fin: '2026-08-28T10:20:00' }).expect(200);
      /* Ya cerrada [10:00, 10:20): una que la pisa también es 409. */
      await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T10:15:00', fin: '2026-08-28T10:25:00' })).expect(409);
    });

    it('inicio futuro o anterior a la orden → 422', async () => {
      const futuro = await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2099-01-01T00:00:00', fin: undefined })).expect(422);
      expect(futuro.body.details).toHaveProperty('inicio');
      /* ORD-0814 empezó el 2026-08-28 a las 06:00. */
      await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-27T08:00:00', fin: undefined })).expect(422);
    });

    it('fin anterior al inicio o basura → 422 (no 0 min ni 500)', async () => {
      const { body } = await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ inicio: '2026-08-28T11:00:00', fin: undefined }))
        .expect(201);
      await http().post(`/api/v1/paradas/${body.id}/finalizar`).set(como('luis')).send({ fin: '2026-08-28T10:59:00' }).expect(422);
      await http().post(`/api/v1/paradas/${body.id}/finalizar`).set(como('luis')).send({ fin: 'xyz' }).expect(422);
      const { body: cerrada } = await http()
        .post(`/api/v1/paradas/${body.id}/finalizar`)
        .set(como('luis'))
        .send({ fin: '2026-08-28T11:07:00' })
        .expect(200);
      expect(cerrada.duracionMin).toBe(7);
      await http().patch(`/api/v1/paradas/${body.id}`).set(como('luis')).send({ fin: '2026-08-28T10:00:00' }).expect(422);
    });

    it('reabrir (fin: null) con otra parada abierta en la línea → 409', async () => {
      const { inicio, fin } = franja();
      const { body: cerrada } = await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio, fin })).expect(201);
      const { body: abierta } = await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ inicio: '2026-08-28T12:00:00', fin: undefined }))
        .expect(201);
      await http().patch(`/api/v1/paradas/${cerrada.id}`).set(como('luis')).send({ fin: null }).expect(409);
      await http().post(`/api/v1/paradas/${abierta.id}/finalizar`).set(como('luis')).send({ fin: '2026-08-28T12:05:00' }).expect(200);
    });
  });

  describe('Bug 1 · parada abierta en una orden que no está en curso', () => {
    it('sin fin → 422 al crear y al reabrir con PATCH; con fin → 201', async () => {
      /* ORD-0815 (LLEN-A1) está por validar. */
      const base = { ordenId: 'ORD-0815', lineaId: 'LIN-LLEN-A1' };
      const { body: orden } = await http().get('/api/v1/ordenes/ORD-0815').set(como('supervisor')).expect(200);
      const inicio = orden.inicio.slice(0, 16) + ':00';
      const { body } = await http().post('/api/v1/paradas').set(como('supervisor')).send(parada({ ...base, inicio, fin: undefined })).expect(422);
      expect(body.details).toHaveProperty('fin');
      await http().patch('/api/v1/paradas/PAR-0815-02').set(como('supervisor')).send({ fin: null }).expect(422);
    });

    it('el 409 de parada abierta cita fecha y orden', async () => {
      const { body: abierta } = await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T13:00:00', fin: undefined })).expect(201);
      const { body } = await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T13:10:00', fin: undefined })).expect(409);
      expect(body.message).toContain('2026-08-28 13:00');
      expect(body.message).toContain('ORD-0814');
      await http().post(`/api/v1/paradas/${abierta.id}/finalizar`).set(como('luis')).send({ fin: '2026-08-28T13:05:00' }).expect(200);
    });
  });

  describe('Bug 2 · tolerancia de un minuto', () => {
    it('cerrar a las 12:24:40 y abrir otra a «12:24» no solapa; un solape real sí', async () => {
      await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T12:20:00', fin: '2026-08-28T12:24:40' })).expect(201);
      const { body: b } = await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T12:24:00', fin: '2026-08-28T12:30:00' })).expect(201);
      expect(b.duracionMin).toBe(6);
      await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T12:23:00', fin: '2026-08-28T12:25:00' })).expect(409);
    });

    it('parada en el minuto de arranque de la orden (con segundos) → 201', async () => {
      const [{ inicio }] = await ds.query(`SELECT inicio FROM orden_fabricacion WHERE id = 'ORD-0814'`);
      await ds.query(`UPDATE orden_fabricacion SET inicio = '2026-08-28T06:00:40' WHERE id = 'ORD-0814'`);
      try {
        const { body } = await http().post('/api/v1/paradas').set(como('luis')).send(parada({ inicio: '2026-08-28T06:00:00', fin: '2026-08-28T06:02:00' })).expect(201);
        expect(body.duracionMin).toBe(2);
      } finally {
        await ds.query(`UPDATE orden_fabricacion SET inicio = ? WHERE id = 'ORD-0814'`, [inicio]);
      }
    });
  });

  describe('A8 · PATCH de merma no mueve el registro', () => {
    it('422 al cambiar ordenId (también inexistente) o lineaId', async () => {
      const { body } = await http().post('/api/v1/mermas').set(como('luis')).send(merma({ responsableId: 'USR-07' })).expect(201);
      await http().patch(`/api/v1/mermas/${body.id}`).set(como('jefe')).send({ ordenId: 'ORD-0813' }).expect(422);
      await http().patch(`/api/v1/mermas/${body.id}`).set(como('jefe')).send({ ordenId: 'ORD-NO-EXISTE' }).expect(422);
      await http().patch(`/api/v1/mermas/${body.id}`).set(como('jefe')).send({ lineaId: 'LIN-LLEN-M1' }).expect(422);
    });
  });

  describe('M3 · árbol de causas de parada', () => {
    it('rechaza causas que no son hoja y tipoCausaId incoherente o inexistente (422)', async () => {
      for (const extra of [
        { causaId: 'CPA-PN-04' },
        { causaId: 'CPA-PN-04-A' },
        { causaId: 'CPA-PN-04-02', tipoCausaId: 'CPA-PP-01' },
        { causaId: 'CPA-PN-04-02', tipoCausaId: 'NO-EXISTE' },
      ]) {
        await http().post('/api/v1/paradas').set(como('luis')).send(parada({ ...franja(), ...extra })).expect(422);
      }
    });

    it('PATCH a una causa dada de baja o que exige solicitud sin darla → 422', async () => {
      await ds.query(`UPDATE causa_parada SET estado = 'inactivo' WHERE id = 'CPA-PN-04-03'`);
      await ds.query(`UPDATE causa_parada SET "requiereSolicitud" = 1 WHERE id = 'CPA-PN-04-04'`);
      const { body } = await http().post('/api/v1/paradas').set(como('luis')).send(parada(franja())).expect(201);
      await http().patch(`/api/v1/paradas/${body.id}`).set(como('luis')).send({ causaId: 'CPA-PN-04-03' }).expect(422);
      const { body: sinSolicitud } = await http()
        .patch(`/api/v1/paradas/${body.id}`)
        .set(como('luis'))
        .send({ causaId: 'CPA-PN-04-04', numeroSolicitud: '   ' })
        .expect(422);
      expect(sinSolicitud.details).toHaveProperty('numeroSolicitud');
    });
  });

  describe('M4 · detecciones ya procesadas', () => {
    it('descartar una detección ya confirmada o descartada → 409', async () => {
      await ds.query(
        `INSERT INTO deteccion_iot (id, "lineaId", "lineaCodigo", "detectadaEn", minutos, estado, texto)
         VALUES ('IOT-QA-01', 'LIN-EXTR-2', 'EXTR-2', '2026-08-28T13:00:00', 2, 'sugerida', 'QA')`,
      );
      const { body } = await http()
        .post('/api/v1/detecciones-iot/IOT-QA-01/confirmar')
        .set(como('jorge'))
        .send({ causaId: 'CPA-PN-04-02', accionTomada: 'Confirmada desde el sensor', tiempoRegistroSeg: 5 })
        .expect(201);
      expect(body.parada.causaId).toBe('CPA-PN-04-02');
      expect(body.deteccion.estado).toBe('confirmada');
      await http().post('/api/v1/detecciones-iot/IOT-QA-01/descartar').set(como('jorge')).expect(409);
      await http().post(`/api/v1/paradas/${body.parada.id}/finalizar`).set(como('jorge')).send({ fin: '2026-08-28T13:05:00' }).expect(200);
    });

    it('confirmar con una causa tipo (no hoja) → 422', async () => {
      await http()
        .post('/api/v1/detecciones-iot/IOT-EXTR2-01/confirmar')
        .set(como('jorge'))
        .send({ causaId: 'CPA-PN-04', accionTomada: 'Confirmada desde el sensor' })
        .expect(422);
    });
  });

  describe('M5 · PATCH de merma revalida el árbol', () => {
    it('cambiar el tipo a uno que la causa no admite → 422', async () => {
      await ds.query(`UPDATE causa_merma SET "aplicaA" = '["PT"]' WHERE id = 'CME-MP-01-02'`);
      const { body } = await http()
        .post('/api/v1/mermas')
        .set(como('luis'))
        .send(merma({ tipo: 'PT', causaId: 'CME-MP-01-02', responsableId: 'USR-07' }))
        .expect(201);
      await http().patch(`/api/v1/mermas/${body.id}`).set(como('luis')).send({ tipo: 'EP' }).expect(422);
    });
  });

  describe('M6 · tarjeta de tiempo real', () => {
    it('la última parada de una línea en parada es la abierta', async () => {
      const { body: abierta } = await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ inicio: '2026-08-28T13:30:00', fin: undefined }))
        .expect(201);
      const { body } = await http().get('/api/v1/tiempo-real/lineas').set(como('jefe')).expect(200);
      const linea = body.lineas.find((l: { lineaId: string }) => l.lineaId === 'LIN-LLEN-M2');
      expect(linea.estado).toBe('parada');
      expect(linea.ultimaParada.enCurso).toBe(true);
      await http().post(`/api/v1/paradas/${abierta.id}/finalizar`).set(como('luis')).send({ fin: '2026-08-28T13:35:00' }).expect(200);
    });
  });

  describe('M7 · 422/404 en vez de 500', () => {
    it('responsable inexistente en PATCH y detección falsa al crear', async () => {
      const { body } = await http().post('/api/v1/paradas').set(como('luis')).send(parada(franja())).expect(201);
      await http().patch(`/api/v1/paradas/${body.id}`).set(como('luis')).send({ responsableId: 'USR-XX' }).expect(422);
      const { body: m } = await http().post('/api/v1/mermas').set(como('luis')).send(merma({ responsableId: 'USR-07' })).expect(201);
      await http().patch(`/api/v1/mermas/${m.id}`).set(como('luis')).send({ responsableId: 'USR-XX' }).expect(422);
      await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ ...franja(), origen: 'iot', deteccionId: 'IOT-FALSA' }))
        .expect(422);
    });
  });

  describe('M8 / M9 / B4 · límites de texto, TRI y fotos', () => {
    it(`tiempoRegistroSeg > ${TIEMPO_REGISTRO_MAX_SEG} → 422; acción solo de espacios → 422`, async () => {
      await http().post('/api/v1/velocidades').set(como('luis')).send(velocidad({ tiempoRegistroSeg: TIEMPO_REGISTRO_MAX_SEG + 1 })).expect(422);
      await http().post('/api/v1/paradas').set(como('luis')).send(parada({ ...franja(), accionTomada: '            ' })).expect(422);
    });

    it('sabor fuera de catálogo y código de balde enorme → 422', async () => {
      await http().post('/api/v1/mermas').set(como('luis')).send(merma({ sabor: 'Sabor inventado' })).expect(422);
      await http().post('/api/v1/mermas').set(como('luis')).send(merma({ codigoBalde: 'B'.repeat(51) })).expect(422);
    });

    it('rechaza contenido que no es imagen aunque se llame .png', async () => {
      await subirFoto('luis', Buffer.from('<html><script>alert(1)</script></html>'), 'x.png').expect(422);
    });

    it('la foto debe ser del mismo usuario, existir y no estar ya vinculada', async () => {
      const { body: deMaria } = await subirFoto('mermas').expect(201);
      await http()
        .post('/api/v1/mermas')
        .set(como('luis'))
        .send(merma({ responsableId: 'USR-07', evidenciaUrl: deMaria.url }))
        .expect(422);
      await http()
        .post('/api/v1/mermas')
        .set(como('luis'))
        .send(merma({ responsableId: 'USR-07', evidenciaUrl: `/api/v1/evidencias/../../${deMaria.nombre}` }))
        .expect(422);

      const { body: deLuis } = await subirFoto('luis').expect(201);
      await http().post('/api/v1/mermas').set(como('luis')).send(merma({ responsableId: 'USR-07', evidenciaUrl: deLuis.url })).expect(201);
      const { body: reuso } = await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ ...franja(), evidenciaUrl: deLuis.url }))
        .expect(422);
      expect(reuso.details).toHaveProperty('evidenciaUrl');
    });
  });

  describe('B1 · foto demasiado grande', () => {
    it('413 en español con detalle del campo', async () => {
      const grande = Buffer.concat([PNG_1X1, Buffer.alloc(9 * 1024 * 1024)]);
      const { body } = await subirFoto('luis', grande, 'grande.png').expect(413);
      expect(body.message).toMatch(/supera el máximo/);
      expect(body.details).toHaveProperty('archivo');
    });
  });

  describe('B3 · PATCH de parada no la mueve', () => {
    it('422 al enviar otra lineaId u ordenId', async () => {
      const { body } = await http().post('/api/v1/paradas').set(como('luis')).send(parada(franja())).expect(201);
      await http().patch(`/api/v1/paradas/${body.id}`).set(como('jefe')).send({ lineaId: 'LIN-EXTR-2' }).expect(422);
      await http().patch(`/api/v1/paradas/${body.id}`).set(como('jefe')).send({ ordenId: 'ORD-0813' }).expect(422);
    });
  });

  describe('B6 · filtro de detecciones', () => {
    it('estado inválido → 422', async () => {
      await http().get('/api/v1/detecciones-iot?estado=xxx').set(como('jefe')).expect(422);
    });
  });

  describe('C1 · recálculo de la orden con el usuario', () => {
    it('supervisor corrige una merma de una orden por validar → recalcula mermasKg', async () => {
      const { body: mermas } = await http().get('/api/v1/ordenes/ORD-0815/mermas').set(como('jefe')).expect(200);
      const m = mermas.data[0];
      const { body: antes } = await http().get('/api/v1/ordenes/ORD-0815').set(como('jefe')).expect(200);
      await http().patch(`/api/v1/mermas/${m.id}`).set(como('supervisor')).send({ cantidadKg: m.cantidadKg + 1 }).expect(200);
      const { body: despues } = await http().get('/api/v1/ordenes/ORD-0815').set(como('jefe')).expect(200);
      expect(despues.mermasKg).toBeCloseTo(antes.mermasKg + 1, 1);
    });

    it('PATCH de merma en una orden validada → 409 y el OEE no cambia', async () => {
      const { body: validadas } = await http().get('/api/v1/ordenes?estado=validada&pageSize=50').set(como('jefe')).expect(200);
      let objetivo: { orden: string; merma: { id: string; cantidadKg: number } } | null = null;
      for (const o of validadas.data as { id: string }[]) {
        const { body } = await http().get(`/api/v1/ordenes/${o.id}/mermas`).set(como('jefe')).expect(200);
        if (body.data.length > 0) {
          objetivo = { orden: o.id, merma: body.data[0] };
          break;
        }
      }
      expect(objetivo).not.toBeNull();
      const { body: antes } = await http().get(`/api/v1/ordenes/${objetivo!.orden}`).set(como('jefe')).expect(200);
      await http()
        .patch(`/api/v1/mermas/${objetivo!.merma.id}`)
        .set(como('supervisor'))
        .send({ cantidadKg: objetivo!.merma.cantidadKg + 5 })
        .expect(409);
      const { body: despues } = await http().get(`/api/v1/ordenes/${objetivo!.orden}`).set(como('jefe')).expect(200);
      expect(despues.oee).toEqual(antes.oee);
      expect(despues.mermasKg).toBe(antes.mermasKg);
    });
  });

  describe('R5 · la rama de la causa debe estar activa entera', () => {
    /* Datos heredados: hija activa bajo un padre (o abuelo) dado de baja. */
    it('parada: crear, PATCH y confirmar IoT con un ancestro inactivo → 422; editar otro campo sigue permitido', async () => {
      const { body: previa } = await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ ...franja(), causaId: 'CPA-PN-04-09' }))
        .expect(201);
      await ds.query(`UPDATE causa_parada SET estado = 'inactivo' WHERE id = 'CPA-PN-04-D'`);

      const { body: alta } = await http()
        .post('/api/v1/paradas')
        .set(como('luis'))
        .send(parada({ ...franja(), causaId: 'CPA-PN-04-08' }))
        .expect(422);
      expect(alta.details.causaId).toMatch(/CPA-PN-04-D|dada de baja/);

      const { body: otra } = await http().post('/api/v1/paradas').set(como('luis')).send(parada(franja())).expect(201);
      await http().patch(`/api/v1/paradas/${otra.id}`).set(como('luis')).send({ causaId: 'CPA-PN-04-08' }).expect(422);

      /* La parada antigua con esa causa se puede seguir editando si no cambia la causa. */
      await http()
        .patch(`/api/v1/paradas/${previa.id}`)
        .set(como('luis'))
        .send({ accionTomada: 'Se ajustó el sensor y se reinició la línea' })
        .expect(200);

      await ds.query(
        `INSERT INTO deteccion_iot (id, "lineaId", "lineaCodigo", "detectadaEn", minutos, estado, texto)
         VALUES ('IOT-QA-R5', 'LIN-EXTR-2', 'EXTR-2', '2026-08-28T14:00:00', 2, 'sugerida', 'QA')`,
      );
      const { body: iot } = await http()
        .post('/api/v1/detecciones-iot/IOT-QA-R5/confirmar')
        .set(como('jorge'))
        .send({ causaId: 'CPA-PN-04-08', accionTomada: 'Confirmada desde el sensor', tiempoRegistroSeg: 5 })
        .expect(422);
      expect(iot.details.causaId).toMatch(/dada de baja/);
    });

    it('merma: crear y PATCH con el tipo (abuelo) dado de baja → 422', async () => {
      const { body: previa } = await http()
        .post('/api/v1/mermas')
        .set(como('luis'))
        .send(merma({ responsableId: 'USR-07' }))
        .expect(201);
      await ds.query(`UPDATE causa_merma SET estado = 'inactivo' WHERE id = 'CME-MP-02'`);

      const { body: alta } = await http()
        .post('/api/v1/mermas')
        .set(como('luis'))
        .send(merma({ causaId: 'CME-MP-02-02', responsableId: 'USR-07' }))
        .expect(422);
      expect(alta.details.causaId).toMatch(/CME-MP-02|dada de baja/);
      await http().patch(`/api/v1/mermas/${previa.id}`).set(como('luis')).send({ causaId: 'CME-MP-02-05' }).expect(422);
    });
  });
});
