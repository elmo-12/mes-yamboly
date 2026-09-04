import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CREDENCIALES, crearApp, login } from './app.factory';

/**
 * Módulos de tesis (B2): reportes, alertas, analítica y evidencia.
 *
 * Desde la fase 3 el postest **no se siembra**: los instrumentos arrancan en
 * «sin datos» y sólo el pretest del TRI y la lista de cotejo del CFS existen de
 * antemano. El flujo completo (importar fuentes → validar → encuestar →
 * confirmar alertas) vive en `evidence-validacion.e2e-spec.ts`.
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
    it('devuelve los 5 KPI con el postest todavía sin datos', async () => {
      const { body } = await get('/evidencia/resumen').expect(200);

      expect(body.pretestDesde).toBe('2026-08-24');
      expect(body.postestHasta).toBe('2026-12-19');
      expect(body.kpis).toHaveLength(5);

      const porId = Object.fromEntries(
        (body.kpis as { id: string; valor: number | null; estado: string; detalle: string }[]).map(
          (k) => [k.id, k],
        ),
      );
      /* Los 4 instrumentos del postest se llenan con el uso real del sistema. */
      expect(porId.TRI).toMatchObject({ valor: null, estado: 'sin_datos' });
      expect(porId.TCI).toMatchObject({ valor: null, estado: 'sin_datos' });
      expect(porId.TSP).toMatchObject({ valor: null, estado: 'sin_datos' });
      expect(porId.EP).toMatchObject({ valor: null, estado: 'sin_datos' });
      /* La lista de cotejo existe pero arranca sin ninguna funcionalidad marcada. */
      expect(porId.CFS).toMatchObject({ valor: 0, estado: 'no_cumple' });
      expect(porId.TCI!.detalle).toContain('fuentes externas');

      expect(body.comparativaTri).toEqual([
        { etapa: 'Pretest', minutos: 2.9 },
        { etapa: 'Postest', minutos: null },
      ]);
    });
  });

  it('GET /evidencia/tri conserva el pretest de 2,9 min y no tiene postest', async () => {
    const { body } = await get('/evidencia/tri').expect(200);
    expect(body.promedioPretest).toBe(2.9);
    expect(body.promedioPostest).toBeNull();
    expect(body.reduccionPct).toBeNull();
    expect(body.pretest).toHaveLength(10);
    expect(body.postest).toHaveLength(0);
    expect(body.estado).toBe('sin_datos');
  });

  it('GET /evidencia/tci arranca vacío y expone el estado de las 3 fuentes', async () => {
    const { body } = await get('/evidencia/tci').expect(200);
    expect(body.data).toHaveLength(0);
    expect(body.meta).toMatchObject({ page: 1, total: 0 });
    expect(body.resumen).toMatchObject({
      registrosCorrectos: 0,
      registrosTotales: 0,
      porcentaje: null,
      estado: 'sin_datos',
    });
    expect(body.resumen.porTipo).toEqual({
      parada: { correctos: 0, totales: 0 },
      merma: { correctos: 0, totales: 0 },
      velocidad: { correctos: 0, totales: 0 },
    });
    expect(body.resumen.fuentes.map((f: { tipo: string }) => f.tipo)).toEqual([
      'sensores',
      'solicitudes',
      'sap_mermas',
    ]);
  });

  it('GET /evidencia/cfs lista las 9 funcionalidades sin verificar', async () => {
    const { body } = await get('/evidencia/cfs').expect(200);
    expect(body.items).toHaveLength(9);
    expect(body.cumplidas).toBe(0);
    expect(body.totales).toBe(9);
    expect(body.porcentaje).toBe(0);
  });

  /* ---------------------------------------------------------------- */
  /* Encuesta pública (Anexo 04)                                       */
  /* ---------------------------------------------------------------- */

  describe('encuesta pública', () => {
    /* Ya no hay tokens sembrados: el investigador emite la invitación. */
    let tokenEncuesta = '';

    beforeAll(async () => {
      const { body } = await post('/evidencia/tsp/invitaciones')
        .send({ invitado: 'Rosa Huamán', rol: 'Supervisora' })
        .expect(201);
      tokenEncuesta = body.invitacion.token as string;
      expect(body.invitacion.url).toContain(`/encuesta/${tokenEncuesta}`);
    });

    it('GET /encuesta/:token responde sin autenticación con los 8 ítems', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/api/v1/encuesta/${tokenEncuesta}`)
        .expect(200);
      expect(body.items).toHaveLength(8);
      expect(body.respondida).toBe(false);
    });

    it('POST /encuesta/:token guarda (201) y rechaza el segundo envío (409)', async () => {
      const respuestas = [5, 4, 4, 5, 4, 4, 5, 4];

      const primera = await request(app.getHttpServer())
        .post(`/api/v1/encuesta/${tokenEncuesta}`)
        .send({ respuestas })
        .expect(201);
      expect(primera.body.recibido).toBe(true);
      expect(primera.body.respuestas).toBe(1);

      await request(app.getHttpServer())
        .post(`/api/v1/encuesta/${tokenEncuesta}`)
        .send({ respuestas })
        .expect(409);

      const tsp = await get('/evidencia/tsp').expect(200);
      expect(tsp.body).toMatchObject({ respuestas: 1, invitados: 1, pctAcuerdo: 100 });
    });

    it('rechaza respuestas fuera del rango 1–5', async () => {
      const { body } = await post('/evidencia/tsp/invitaciones')
        .send({ invitado: 'Pedro Ccahuana' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/encuesta/${body.invitacion.token}`)
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
      /* Las alertas del seed son operativas: no generan filas del Anexo 06. */
      expect(body.epAcumulada).toBe(0);
    });

    it('atender y luego confirmar una alerta mueve el KPI EP', async () => {
      const antes = await get('/evidencia/ep').expect(200);
      expect(antes.body.prediccionesTotales).toBe(0);
      expect(antes.body.porcentaje).toBeNull();
      expect(antes.body.estado).toBe('sin_datos');

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
      expect(confirmada.body.ep).toBe(100);

      /* 409 al confirmar dos veces la misma alerta. */
      await post('/alertas/ALE-001/confirmar').send({ ocurrio: true }).expect(409);

      const despues = await get('/evidencia/ep').expect(200);
      expect(despues.body.prediccionesTotales).toBe(1);
      expect(despues.body.prediccionesCorrectas).toBe(1);
      expect(despues.body.porcentaje).toBe(100);
      expect(despues.body.estado).toBe('cumple');
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

    it('los umbrales incluyen las tolerancias de la validación de calidad (TCI)', async () => {
      const vigentes = await get('/alertas/umbrales').expect(200);
      expect(vigentes.body).toMatchObject({
        tciToleranciaMin: 5,
        tciToleranciaPct: 5,
        tciToleranciaDiasSap: 1,
      });

      const { body } = await request(app.getHttpServer())
        .put('/api/v1/alertas/umbrales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          velocidadBajoEstandarPct: 5,
          oeeMinimo: 75,
          probabilidadMinima: 70,
          notificarN8n: true,
          mostrarTv: true,
          tciToleranciaMin: 8,
          tciToleranciaPct: 6,
          tciToleranciaDiasSap: 2,
        })
        .expect(200);
      expect(body).toMatchObject({ tciToleranciaMin: 8, tciToleranciaPct: 6, tciToleranciaDiasSap: 2 });

      /* Un PUT sin las tolerancias conserva las vigentes. */
      const sinTolerancias = await request(app.getHttpServer())
        .put('/api/v1/alertas/umbrales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          velocidadBajoEstandarPct: 5,
          oeeMinimo: 75,
          probabilidadMinima: 70,
          notificarN8n: true,
          mostrarTv: true,
        })
        .expect(200);
      expect(sinTolerancias.body).toMatchObject({ tciToleranciaMin: 8, tciToleranciaDiasSap: 2 });

      await request(app.getHttpServer())
        .put('/api/v1/alertas/umbrales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          velocidadBajoEstandarPct: 5,
          oeeMinimo: 75,
          probabilidadMinima: 70,
          notificarN8n: true,
          mostrarTv: true,
          tciToleranciaMin: 120,
        })
        .expect(422);
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
      expect(body.oeePorLinea).toHaveLength(9);
      expect(body.oeePorLinea[0]).toMatchObject({
        lineaCodigo: 'EXTR-2',
        oee: 82.1,
        disponibilidad: 93.4,
        desempeno: 89.6,
        calidad: 98.1,
      });

      expect(body.comparativaTurno.map((t: { turno: string }) => t.turno)).toEqual(['D', 'N']);
    });

    it('acepta el alias 7d y el filtro de línea recalculando los KPI', async () => {
      const { body } = await get('/reportes/indicadores?periodo=7d&lineaId=LIN-LLEN-A2').expect(200);
      expect(body.oeePorLinea).toHaveLength(1);
      expect(body.kpis.find((k: { id: string }) => k.id === 'oee').valor).toBe(71.8);
    });

    it('GET /reportes/paradas devuelve Pareto acumulado y donut de 612 min', async () => {
      const { body } = await get('/reportes/paradas').expect(200);
      expect(body.kpis.map((k: { valor: number }) => k.valor)).toEqual([48, 612, 12.8, 4.3]);
      expect(body.pareto[0]).toMatchObject({ causaCodigo: 'PN-02', minutos: 179 });
      expect(body.pareto.at(-1).acumuladoPct).toBe(100);
      expect(body.donut.map((d: { valor: number }) => d.valor)).toEqual([211, 171, 230]);
      expect(body.detallePorCausa).toHaveLength(5);
    });

    it('GET /reportes/mermas suma 412 kg entre líneas y causas', async () => {
      const { body } = await get('/reportes/mermas').expect(200);
      expect(body.kpis[0]).toMatchObject({ valor: 412, unidad: 'kg' });
      const totalLineas = body.apiladasPorLinea.reduce(
        (a: number, l: { total: number }) => a + l.total,
        0,
      );
      expect(totalLineas).toBe(412);
      expect(body.heatmap).toHaveLength(10);
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
      /* Top-5 de riesgo (no una fila por línea): lista curada en
       * `analytics.constants.ts`, ya migrada a códigos de línea reales. */
      expect(body.riesgoPorLinea).toHaveLength(5);
      expect(body.prediccionesActivas.length).toBeGreaterThan(0);
    });

    it('GET /analitica/patrones calcula el heatmap de 5 causas × 2 turnos', async () => {
      const { body } = await get('/analitica/patrones').expect(200);
      expect(body.heatmap).toHaveLength(10);
      const pn02Dia = body.heatmap.find(
        (c: { fila: string; columna: string }) => c.fila === 'PN-02' && c.columna === 'D',
      );
      expect(pn02Dia.valor).toBe(96);
      expect(body.recurrencias).toHaveLength(6);
    });

    it('GET /analitica/modelo y /estado-datos', async () => {
      const modelo = await get('/analitica/modelo').expect(200);
      expect(modelo.body.fasesCrispDm).toHaveLength(6);
      expect(modelo.body.metricas).toMatchObject({ registros: 2140, features: 14, auc: 0.86, f1: 0.79 });
      expect(modelo.body.variablesEntrada).toHaveLength(8);

      /* 2 130 eventos migrados + 0 capturas del postest (el TRI arranca vacío). */
      const datos = await get('/analitica/estado-datos').expect(200);
      expect(datos.body).toMatchObject({ eventos: 2130, requeridos: 2000, suficiente: true });

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
