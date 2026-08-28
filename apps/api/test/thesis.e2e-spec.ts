import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CREDENCIALES, crearApp, login } from './app.factory';

/**
 * Módulos de tesis (B2): reportes, alertas, analítica y evidencia.
 * Comprueba que los 5 KPI cierran con las cifras de los Anexos 02–06 y que
 * confirmar una alerta mueve el KPI EP.
 */
describe('tesis · reports · alerts · analytics · evidence (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await crearApp();
    token = await login(app, CREDENCIALES.jefe);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (ruta: string) =>
    request(app.getHttpServer()).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
  const post = (ruta: string) =>
    request(app.getHttpServer()).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);

  /* ---------------------------------------------------------------- */
  /* Evidencia                                                         */
  /* ---------------------------------------------------------------- */

  describe('GET /evidencia/resumen', () => {
    it('devuelve los 5 KPI de la tesis con las cifras de los anexos', async () => {
      const { body } = await get('/evidencia/resumen').expect(200);

      expect(body.pretestDesde).toBe('2026-08-24');
      expect(body.postestHasta).toBe('2026-12-19');
      expect(body.kpis).toHaveLength(5);

      const porId = Object.fromEntries(
        (body.kpis as { id: string; valor: number; estado: string }[]).map((k) => [k.id, k]),
      );
      expect(porId.TRI).toMatchObject({ valor: 1.4, estado: 'cumple' });
      expect(porId.TCI).toMatchObject({ valor: 93.3, estado: 'cumple' });
      expect(porId.TSP).toMatchObject({ valor: 84.2, estado: 'cumple' });
      expect(porId.CFS).toMatchObject({ valor: 100, estado: 'cumple' });
      expect(porId.EP).toMatchObject({ valor: 83.5, estado: 'cumple' });

      expect(body.comparativaTri).toEqual([
        { etapa: 'Pretest', minutos: 2.9 },
        { etapa: 'Postest', minutos: 1.4 },
      ]);
    });
  });

  it('GET /evidencia/tri devuelve −51,7 % frente al pretest', async () => {
    const { body } = await get('/evidencia/tri').expect(200);
    expect(body.promedioPostest).toBe(1.4);
    expect(body.promedioPretest).toBe(2.9);
    expect(body.reduccionPct).toBe(-51.7);
    expect(body.postest).toHaveLength(10);
  });

  it('GET /evidencia/tci aplica las reglas de los 4 criterios: 28 / 30', async () => {
    const { body } = await get('/evidencia/tci').expect(200);
    expect(body.registrosCorrectos).toBe(28);
    expect(body.registrosTotales).toBe(30);
    expect(body.porcentaje).toBe(93.3);
    const invalido = body.registros.find((r: { valido: boolean }) => !r.valido);
    expect(invalido.preciso).toBe(false);
  });

  it('GET /evidencia/cfs devuelve 9 / 9 funcionalidades', async () => {
    const { body } = await get('/evidencia/cfs').expect(200);
    expect(body.cumplidas).toBe(9);
    expect(body.totales).toBe(9);
    expect(body.porcentaje).toBe(100);
  });

  /* ---------------------------------------------------------------- */
  /* Encuesta pública (Anexo 04)                                       */
  /* ---------------------------------------------------------------- */

  describe('encuesta pública', () => {
    /* `tsp-2026-21` y `tsp-2026-22` son los tokens sin responder de la semilla. */
    const token21 = 'tsp-2026-21';

    it('GET /encuesta/:token responde sin autenticación con los 8 ítems', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/api/v1/encuesta/${token21}`)
        .expect(200);
      expect(body.items).toHaveLength(8);
      expect(body.respondida).toBe(false);
    });

    it('POST /encuesta/:token guarda (201) y rechaza el segundo envío (409)', async () => {
      const respuestas = [5, 4, 4, 5, 4, 4, 5, 4];

      const primera = await request(app.getHttpServer())
        .post(`/api/v1/encuesta/${token21}`)
        .send({ respuestas })
        .expect(201);
      expect(primera.body.recibido).toBe(true);
      expect(primera.body.respuestas).toBe(20);

      await request(app.getHttpServer())
        .post(`/api/v1/encuesta/${token21}`)
        .send({ respuestas })
        .expect(409);
    });

    it('rechaza respuestas fuera del rango 1–5', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/encuesta/tsp-2026-22')
        .send({ respuestas: [5, 4, 4, 5, 4, 4, 5, 9] })
        .expect(422);
    });

    it('404 con un token inexistente', async () => {
      await request(app.getHttpServer()).get('/api/v1/encuesta/no-existe').expect(404);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Alertas y KPI EP                                                  */
  /* ---------------------------------------------------------------- */

  describe('alertas', () => {
    it('GET /alertas/resumen coincide con la composición de la semilla', async () => {
      const { body } = await get('/alertas/resumen').expect(200);
      expect(body).toMatchObject({
        activas: 6,
        atendidasHoy: 9,
        pendientesConfirmar: 4,
        vencidas: 2,
      });
      expect(body.epAcumulada).toBe(83.5);
    });

    it('atender y luego confirmar una alerta mueve el KPI EP', async () => {
      const antes = await get('/evidencia/ep').expect(200);
      expect(antes.body.prediccionesTotales).toBe(164);
      expect(antes.body.porcentaje).toBe(83.5);

      const atendida = await post('/alertas/ALE-001/atender')
        .send({ accionTomada: 'Se detuvo la línea y se purgó la boquilla de la envolvedora' })
        .expect(200);
      expect(atendida.body.alerta.estado).toBe('atendida');
      expect(atendida.body.alerta.accionTomada).toContain('purgó');

      const confirmada = await post('/alertas/ALE-001/confirmar')
        .send({ ocurrio: true, observacion: 'La parada ocurrió a las 15:02' })
        .expect(200);
      expect(confirmada.body.alerta.estado).toBe('confirmada');
      expect(confirmada.body.alerta.acierto).toBe(true);
      /* El contrato (@mes/types + mocks) define `ep` como la EP acumulada en %. */
      expect(confirmada.body.ep).toBe(83.6);

      /* 409 al confirmar dos veces la misma alerta. */
      await post('/alertas/ALE-001/confirmar').send({ ocurrio: true }).expect(409);

      const despues = await get('/evidencia/ep').expect(200);
      expect(despues.body.prediccionesTotales).toBe(165);
      expect(despues.body.porcentaje).toBe(83.6);
    });

    it('exige al menos 10 caracteres en la acción tomada', async () => {
      await post('/alertas/ALE-002/atender').send({ accionTomada: 'ok' }).expect(422);
    });

    it('PUT /alertas/umbrales devuelve 403 a un maquinista', async () => {
      const tokenMaquinista = await login(app, CREDENCIALES.maquinista);
      await request(app.getHttpServer())
        .put('/api/v1/alertas/umbrales')
        .set('Authorization', `Bearer ${tokenMaquinista}`)
        .send({
          velocidadBajoEstandarPct: 6,
          oeeMinimo: 78,
          probabilidadMinima: 72,
          notificarN8n: true,
          mostrarTv: true,
        })
        .expect(403);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Reportes                                                          */
  /* ---------------------------------------------------------------- */

  describe('reportes', () => {
    it('GET /reportes/indicadores devuelve la forma completa con OEE 79,8 %', async () => {
      const { body } = await get('/reportes/indicadores?periodo=semana').expect(200);

      expect(body).toEqual(
        expect.objectContaining({
          periodo: 'semana',
          desde: expect.any(String),
          hasta: expect.any(String),
          kpis: expect.any(Array),
          tendenciaOee: expect.any(Array),
          oeePorLinea: expect.any(Array),
          comparativaTurno: expect.any(Array),
        }),
      );

      const oee = body.kpis.find((k: { id: string }) => k.id === 'oee');
      expect(oee).toMatchObject({ valor: 79.8, unidad: '%', meta: 85 });
      expect(oee.delta).toMatchObject({ valor: 1.4, unidad: 'pp', referencia: 'vs periodo anterior' });

      expect(body.tendenciaOee).toHaveLength(7);
      expect(body.tendenciaOee.at(-1)).toMatchObject({ oee: 79.8, meta: 85 });

      /* OEE por línea se deriva con `computeOee` sobre las magnitudes crudas. */
      expect(body.oeePorLinea).toHaveLength(5);
      expect(body.oeePorLinea[0]).toMatchObject({
        lineaCodigo: 'L1',
        oee: 82.1,
        disponibilidad: 93.4,
        desempeno: 89.6,
        calidad: 98.1,
      });

      expect(body.comparativaTurno.map((t: { turno: string }) => t.turno)).toEqual(['M', 'T', 'N']);
    });

    it('acepta el alias 7d y el filtro de línea recalculando los KPI', async () => {
      const { body } = await get('/reportes/indicadores?periodo=7d&lineaId=LIN-04').expect(200);
      expect(body.oeePorLinea).toHaveLength(1);
      expect(body.kpis.find((k: { id: string }) => k.id === 'oee').valor).toBe(71.8);
    });

    it('GET /reportes/paradas devuelve Pareto acumulado y donut de 612 min', async () => {
      const { body } = await get('/reportes/paradas').expect(200);
      expect(body.kpis.map((k: { valor: number }) => k.valor)).toEqual([48, 612, 12.8, 4.3]);
      expect(body.pareto[0]).toMatchObject({ causaCodigo: 'PM-01', minutos: 142 });
      expect(body.pareto.at(-1).acumuladoPct).toBe(100);
      expect(body.donut.map((d: { valor: number }) => d.valor)).toEqual([230, 138, 244]);
      expect(body.detallePorCausa).toHaveLength(7);
    });

    it('GET /reportes/mermas suma 412 kg entre líneas y causas', async () => {
      const { body } = await get('/reportes/mermas').expect(200);
      expect(body.kpis[0]).toMatchObject({ valor: 412, unidad: 'kg' });
      const totalLineas = body.apiladasPorLinea.reduce(
        (a: number, l: { total: number }) => a + l.total,
        0,
      );
      expect(totalLineas).toBe(412);
      expect(body.heatmap).toHaveLength(12);
      expect(body.tabla.reduce((a: number, t: { kg: number }) => a + t.kg, 0)).toBe(412);
    });

    it('POST /reportes/exportar encola el trabajo y lo deja descargable', async () => {
      const { body } = await post('/reportes/exportar')
        .send({ datasets: ['paradas', 'mermas'], formato: 'xlsx', desde: '2026-01-01', hasta: '2030-12-31' })
        .expect(202);
      expect(body.estado).toBe('generando');

      /* La generación es asíncrona; se espera a que el job quede listo. */
      let estado = 'generando';
      for (let intento = 0; intento < 40 && estado !== 'listo'; intento += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const historial = await get('/reportes/exportaciones').expect(200);
        estado = historial.body.data.find((j: { id: string }) => j.id === body.id).estado;
      }
      expect(estado).toBe('listo');

      const descarga = await get(`/reportes/exportaciones/${body.id}/descargar`).expect(200);
      expect(descarga.headers['content-type']).toContain('spreadsheetml');
    });

    it('rechaza una exportación sin datasets', async () => {
      await post('/reportes/exportar')
        .send({ datasets: [], formato: 'xlsx', desde: '2026-08-01', hasta: '2026-08-28' })
        .expect(422);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Analítica                                                         */
  /* ---------------------------------------------------------------- */

  describe('analítica', () => {
    it('GET /analitica/resumen describe el modelo v3.2 y sus KPI', async () => {
      const { body } = await get('/analitica/resumen').expect(200);
      expect(body.modelo).toMatchObject({ version: 'v3.2', eventos: 2140, activo: true });
      expect(body.kpis).toMatchObject({ precision: 81, recall: 77, alertas30d: 142 });
      expect(body.insights).toHaveLength(3);
      expect(body.riesgoPorLinea).toHaveLength(5);
      expect(body.prediccionesActivas.length).toBeGreaterThan(0);
    });

    it('GET /analitica/patrones calcula el heatmap de 7 causas × 3 turnos', async () => {
      const { body } = await get('/analitica/patrones').expect(200);
      expect(body.heatmap).toHaveLength(21);
      const pm01Tarde = body.heatmap.find(
        (c: { fila: string; columna: string }) => c.fila === 'PM-01' && c.columna === 'T',
      );
      expect(pm01Tarde.valor).toBe(72);
      expect(body.recurrencias).toHaveLength(6);
    });

    it('GET /analitica/modelo y /estado-datos', async () => {
      const modelo = await get('/analitica/modelo').expect(200);
      expect(modelo.body.fasesCrispDm).toHaveLength(6);
      expect(modelo.body.metricas).toMatchObject({ registros: 2140, features: 14, auc: 0.86, f1: 0.79 });
      expect(modelo.body.variablesEntrada).toHaveLength(9);

      const datos = await get('/analitica/estado-datos').expect(200);
      expect(datos.body).toMatchObject({ eventos: 2140, requeridos: 2000, suficiente: true });

      /* `?estado=insuficiente` fuerza el estado vacío de 08.E sin tocar los datos. */
      const insuficiente = await get('/analitica/estado-datos?estado=insuficiente').expect(200);
      expect(insuficiente.body).toMatchObject({
        eventos: 1250,
        requeridos: 2000,
        suficiente: false,
        progresoPct: 62.5,
      });
    });

    it('GET /analitica/predicciones devuelve 30 puntos de serie', async () => {
      const { body } = await get('/analitica/predicciones').expect(200);
      expect(body.serie).toHaveLength(30);
      expect(body.historico).toHaveLength(24);
    });

    it('POST /analitica/reentrenar deja la nueva versión vigente', async () => {
      const { body } = await post('/analitica/reentrenar').expect(202);
      expect(body).toMatchObject({ estado: 'entrenando', version: 'v3.3' });

      await new Promise((r) => setTimeout(r, 3500));
      const modelo = await get('/analitica/modelo').expect(200);
      expect(modelo.body.versiones[0]).toMatchObject({ version: 'v3.3', estado: 'vigente' });

      /* Volver a v3.2 deja el resto archivado. */
      const vuelta = await post('/analitica/modelo/v3.2/activar').expect(200);
      expect(vuelta.body.versiones.find((v: { version: string }) => v.version === 'v3.2').estado).toBe(
        'vigente',
      );
    });

    it('404 al activar una versión inexistente', async () => {
      await post('/analitica/modelo/v9.9/activar').expect(404);
    });

    it('403 para un maquinista que intenta reentrenar', async () => {
      const tokenMaquinista = await login(app, CREDENCIALES.maquinista);
      await request(app.getHttpServer())
        .post('/api/v1/analitica/reentrenar')
        .set('Authorization', `Bearer ${tokenMaquinista}`)
        .expect(403);
    });
  });
});
