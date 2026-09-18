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
      /* La lista de cotejo existe pero arranca sin ninguna funcionalidad
         verificada: sin verificaciones el CFS es «sin datos», no 0 %. */
      expect(porId.CFS).toMatchObject({ valor: null, estado: 'sin_datos' });
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
    expect(body.verificadas).toBe(0);
    expect(body.porcentaje).toBeNull();
    expect(body.estado).toBe('sin_datos');
    expect(body.items.every((i: { verificadaEn: string | null }) => i.verificadaEn === null)).toBe(
      true,
    );
  });

  /* ---------------------------------------------------------------- */
  /* Encuesta pública (Anexo 04)                                       */
  /* ---------------------------------------------------------------- */

  describe('encuesta pública', () => {
    /* Ya no hay tokens sembrados: el investigador emite la invitación. */
    let tokenEncuesta = '';

    beforeAll(async () => {
      const { body } = await post('/evidencia/tsp/invitaciones')
        .send({ usuarioId: 'USR-06' })
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
        .send({ usuarioId: 'USR-09' })
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
    it('GET /reportes/indicadores calcula OEE, líneas y turnos sobre la ventana pedida', async () => {
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

      /* Los cuatro KPI salen de `computeOee` sobre las órdenes y paradas de la
       * ventana, y el delta compara con los 7 días inmediatamente anteriores. */
      const oee = body.kpis.find((k: { id: string }) => k.id === 'oee');
      expect(oee).toMatchObject({ valor: 75.1, unidad: '%', meta: 85 });
      expect(oee.delta).toMatchObject({ valor: -6.9, unidad: 'pp', referencia: 'vs periodo anterior' });

      /* Un punto por día operativo con órdenes; el último es el fin de ventana. */
      expect(body.tendenciaOee).toHaveLength(7);
      expect(body.tendenciaOee.at(-1)).toMatchObject({ fecha: body.hasta, meta: 85 });

      /* Sólo aparecen las líneas que produjeron en la ventana (las 9, esa semana). */
      expect(body.oeePorLinea).toHaveLength(9);
      expect(body.oeePorLinea[0]).toMatchObject({
        lineaCodigo: 'EXTR-2',
        oee: 71.8,
        disponibilidad: 89.6,
        desempeno: 82,
        calidad: 97.7,
      });
      for (const linea of body.oeePorLinea) {
        const producto = (linea.disponibilidad / 100) * (linea.desempeno / 100) * linea.calidad;
        expect(linea.oee).toBeCloseTo(producto, 0);
      }

      expect(body.comparativaTurno.map((t: { turno: string }) => t.turno)).toEqual(['D', 'N']);
    });

    it('acepta el alias 7d y el filtro de línea recalculando los KPI', async () => {
      const { body } = await get('/reportes/indicadores?periodo=7d&lineaId=LIN-LLEN-A2').expect(200);
      expect(body.oeePorLinea).toHaveLength(1);
      expect(body.oeePorLinea[0].lineaCodigo).toBe('LLEN-A2');
      expect(body.kpis.find((k: { id: string }) => k.id === 'oee').valor).toBe(75.6);
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

    it('rechaza los formatos que el generador no sabe escribir (422)', async () => {
      /* Antes se aceptaban: se producía un XLSX y se entregaba con extensión
       * `.pdf` y `Content-Type: application/pdf`, o sea un archivo corrupto. */
      for (const formato of ['pdf', 'csv']) {
        const { body } = await post('/reportes/exportar')
          .send({ datasets: ['paradas'], formato, desde: '2026-08-01', hasta: '2026-08-28' })
          .expect(422);
        expect(body.details).toHaveProperty('formato');
      }
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
    /**
     * Los asserts de analítica son **invariantes estructurales**, no cifras
     * fijas: desde que el módulo entrena sobre `orden_fabricacion`/`parada` los
     * valores dependen del corpus, y clavarlos volvería a atar el test a una
     * maqueta. Lo que se comprueba es que cada endpoint devuelva algo coherente
     * con lo que hay en la base.
     *
     * `apps/api/test/setup-e2e.ts` deja `PREDICTION_SERVICE_URL` vacía a
     * propósito (sin Docker, sin `services/prediccion-py`): Python es el único
     * motor de modelado (F5), así que el intento de bootstrap del seeder
     * (`ThesisAnalyticsSeeder`) omite el entrenamiento — el orquestador deja
     * una fila `v1.0` **archivada** con el motivo (`GET /salud` no
     * respondió), nunca una `vigente`: es el mismo mecanismo con el que
     * `EntrenamientoContinuoService` archiva cualquier corrida fallida, así
     * que no hay caso especial que mantener sincronizado en dos sitios.
     * Estos tests verifican la decisión de arquitectura que eso implica:
     * ninguna de las 4 pestañas de `/analitica` puede 404 sólo porque
     * todavía no hay ningún modelo `vigente`. El camino feliz del
     * orquestador contra un Python real (o un stub) se prueba aparte en
     * `entrenamiento-continuo.e2e-spec.ts`.
     */
    const esVersion = /^v\d+\.\d+$/;

    it('GET /analitica/resumen responde 200 con el estado «sin modelo vigente»', async () => {
      const { body } = await get('/analitica/resumen').expect(200);

      /* Sin ninguna fila `vigente` el modelo mostrado es el intento
       * archivado del arranque (o el sentinel «sin-entrenar» si ni eso llegó
       * a crearse) — nunca un 404, y nunca `activo`. */
      expect(body.modelo.activo).toBe(false);
      expect(body.modelo.eventos).toBe(0);
      expect(typeof body.modelo.algoritmo).toBe('string');

      for (const kpi of ['ep', 'precision', 'recall'] as const) {
        expect(body.kpis[kpi]).toBeGreaterThanOrEqual(0);
        expect(body.kpis[kpi]).toBeLessThanOrEqual(100);
      }
      expect(body.kpis.alertas30d).toBeGreaterThanOrEqual(0);

      /* Los hallazgos salen de las reglas asociativas: como mucho 3, y cada uno
       * con su métrica de apoyo verificable. */
      expect(body.insights.length).toBeLessThanOrEqual(3);
      for (const insight of body.insights) {
        expect(['warning', 'info', 'success']).toContain(insight.tono);
        expect(insight.soporte.length).toBeGreaterThan(0);
      }

      /* Una fila por línea activa del maestro, no un top-5 curado a mano. */
      const lineas = await get('/lineas').expect(200);
      const activas = (lineas.body.data as { id: string; estado: string }[]).filter(
        (l) => l.estado === 'activo',
      );
      expect(body.riesgoPorLinea).toHaveLength(activas.length);

      /* La causa probable tiene que existir de verdad en `causa_parada`. */
      const causas = await get('/causas-parada?formato=plano').expect(200);
      const etiquetas = new Set(
        (causas.body.data as { codigo: string; nombre: string }[]).map(
          (c) => `${c.codigo} ${c.nombre}`,
        ),
      );
      for (const riesgo of body.riesgoPorLinea) {
        expect(riesgo.riesgo).toBeGreaterThanOrEqual(0);
        expect(riesgo.riesgo).toBeLessThanOrEqual(100);
        expect(['D', 'N']).toContain(riesgo.turnoObjetivo);
        expect(etiquetas.has(riesgo.causaProbable) || riesgo.causaProbable.startsWith('Sin causa')).toBe(
          true,
        );
      }
      /* Todas las líneas comparten el mismo turno objetivo (el siguiente). */
      expect(new Set(body.riesgoPorLinea.map((r: { turnoObjetivo: string }) => r.turnoObjetivo)).size).toBe(1);

      expect(Array.isArray(body.prediccionesActivas)).toBe(true);
    });

    it('GET /analitica/patrones calcula el heatmap sobre las paradas registradas', async () => {
      const { body } = await get('/analitica/patrones').expect(200);

      const causas = await get('/causas-parada?formato=plano&nivel=tipo').expect(200);
      const raices = (causas.body.data as { codigo: string }[]).length;
      /* Una celda por causa raíz × turno (D y N). */
      expect(body.heatmap).toHaveLength(raices * 2);
      for (const celda of body.heatmap) {
        expect(['D', 'N']).toContain(celda.columna);
        expect(celda.valor).toBeGreaterThanOrEqual(0);
      }

      for (const recurrencia of body.recurrencias) {
        expect(recurrencia.frecuencia).toBeGreaterThan(0);
        expect(recurrencia.confianza).toBeGreaterThanOrEqual(0);
        expect(recurrencia.confianza).toBeLessThanOrEqual(100);
        expect(recurrencia.lineas.length).toBeGreaterThan(0);
      }
    });

    it('GET /analitica/modelo expone las 6 fases CRISP-DM aunque todavía no haya modelo entrenado', async () => {
      const { body } = await get('/analitica/modelo').expect(200);
      expect(body.fasesCrispDm).toHaveLength(6);
      for (const fase of body.fasesCrispDm) {
        expect(['completada', 'en_curso', 'pendiente']).toContain(fase.estado);
      }
      /* Sin `services/prediccion-py` no hay ninguna fila `modelo_version`
       * (§F5): sólo la comprensión del negocio —documentación, no depende de
       * datos— está «completada»; el resto espera al primer entrenamiento. */
      const porId = Object.fromEntries(
        (body.fasesCrispDm as { id: string; estado: string }[]).map((f) => [f.id, f.estado]),
      );
      expect(porId.comprension_negocio).toBe('completada');
      expect(porId.modelado).toBe('pendiente');
      expect(porId.evaluacion).toBe('pendiente');

      const { metricas } = body;
      expect(metricas.registros).toBe(0);
      expect(metricas.features).toBe(0);
      expect(metricas.auc).toBeGreaterThanOrEqual(0);
      expect(metricas.auc).toBeLessThanOrEqual(1);
      expect(metricas.f1).toBeGreaterThanOrEqual(0);
      expect(metricas.f1).toBeLessThanOrEqual(1);
      const evaluadas = metricas.vp + metricas.fp + metricas.vn + metricas.fn;
      expect(evaluadas).toBe(0);

      /* El intento de bootstrap deja su propia fila archivada (el mismo
       * mecanismo que archiva cualquier corrida fallida) — nunca una
       * `vigente`. */
      expect(body.versiones.every((v: { estado: string }) => v.estado !== 'vigente')).toBe(true);
      for (const version of body.versiones as { version: string }[]) {
        expect(version.version).toMatch(esVersion);
      }
      expect(body.variablesEntrada).toEqual([]);
    });

    it('GET /analitica/estado-datos cuenta los eventos productivos reales', async () => {
      const { body } = await get('/analitica/estado-datos').expect(200);
      expect(body.requeridos).toBe(2000);
      expect(body.eventos).toBeGreaterThan(0);
      expect(body.suficiente).toBe(body.eventos >= body.requeridos);
      expect(body.progresoPct).toBeCloseTo((body.eventos / body.requeridos) * 100, 0);

      /* El interruptor de demo/QA se conserva: fuerza la variante 08.E vacía. */
      const insuficiente = await get('/analitica/estado-datos?estado=insuficiente').expect(200);
      expect(insuficiente.body.suficiente).toBe(false);

      const suficiente = await get('/analitica/estado-datos?estado=suficiente').expect(200);
      expect(suficiente.body.suficiente).toBe(true);
    });

    /**
     * Decisión de arquitectura (F5, ítem 5): apagar Python no puede romper
     * ninguna pantalla. Las 4 pestañas responden 200 sin modelo entrenado, y
     * `recalcular` sirve las 9 líneas vía `cascada:reglas` sin lanzar ninguna
     * excepción — exactamente lo que promete `docs/prediccion-python.md` §1,
     * regla 4.
     */
    it('arquitectura: con PREDICTION_SERVICE_URL vacía, las 4 pestañas responden 200 y recalcular sirve vía cascada:reglas', async () => {
      for (const pestana of ['resumen', 'patrones', 'predicciones', 'modelo'] as const) {
        await get(`/analitica/${pestana}`).expect(200);
      }

      const { body } = await post('/analitica/predicciones/recalcular').expect(200);
      const lineas = await get('/lineas').expect(200);
      const activas = (lineas.body.data as { estado: string }[]).filter((l) => l.estado === 'activo');
      expect(body.predicciones).toBe(activas.length);
      expect(body.proveedor).toContain('cascada');
      expect(body.proveedor).toContain('reglas');
      /* Con `PREDICTION_SERVICE_URL` vacía la cascada no puede caer en Python. */
      expect(body.proveedor).not.toContain('python');
    });

    it('GET /analitica/predicciones devuelve la serie diaria y el histórico de las predicciones vivas', async () => {
      const { body } = await get('/analitica/predicciones').expect(200);

      expect(body.serie.length).toBeLessThanOrEqual(30);
      const fechas = body.serie.map((p: { fecha: string }) => p.fecha);
      expect([...fechas].sort()).toEqual(fechas);
      for (const punto of body.serie) {
        expect(punto.predicho).toBeGreaterThanOrEqual(0);
        expect(punto.real).toBeGreaterThanOrEqual(0);
      }

      /* El `recalcular` de la prueba anterior deja predicciones «vivas»; no hay
       * backtest porque no hay modelo entrenado, así que el histórico sale
       * enteramente de ese ciclo en vivo. */
      for (const fila of body.historico) {
        expect([true, false, null]).toContain(fila.acierto);
        expect(fila.probabilidad).toBeGreaterThanOrEqual(0);
        expect(fila.probabilidad).toBeLessThanOrEqual(100);
      }
      /* Sin ninguna versión `vigente` no hay matriz de confusión que reportar. */
      expect(body.matrizConfusion).toBeUndefined();
    });

    it('POST /analitica/reentrenar no puede entrenar sin Python y lo deja registrado con un motivo claro', async () => {
      const { body } = await post('/analitica/reentrenar').expect(202);
      expect(body.estado).toBe('entrenando');
      expect(body.version).toMatch(esVersion);

      const final = await esperarReentrenamientoTerminal();
      expect(final.reentrenamiento).toMatchObject({ estado: 'error', version: body.version });
      /* El mensaje tiene que señalar de verdad al servicio de predicción, no
       * un error genérico: es lo que el jefe lee en el toast de la UI. */
      expect(final.reentrenamiento.mensaje).toMatch(/omitido|Python|predicción/i);

      /* La fila candidata queda archivada con su motivo: nunca «vigente» sin
       * que Python la haya entrenado de verdad. */
      const candidata = (final.versiones as { version: string; estado: string }[]).find(
        (v) => v.version === body.version,
      );
      expect(candidata?.estado).toBe('archivada');
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

    /** Sondea `/analitica/modelo` hasta que el reentrenamiento en curso llega a un estado terminal. */
    async function esperarReentrenamientoTerminal(limiteMs = 20_000) {
      const hasta = Date.now() + limiteMs;
      let ultimo: Record<string, never> | undefined;
      while (Date.now() < hasta) {
        const { body } = await get('/analitica/modelo').expect(200);
        ultimo = body;
        if (body.reentrenamiento && body.reentrenamiento.estado !== 'entrenando') return body;
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`El reentrenamiento no llegó a un estado terminal: ${JSON.stringify(ultimo)}`);
    }
  });
});
