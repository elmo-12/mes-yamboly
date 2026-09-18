import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { crearValidationPipe } from '../src/common/pipes/validation.pipe';
import { PythonEntrenamientoClient } from '../src/modules/analytics/modelado';
import { CREDENCIALES, login } from './app.factory';
import { sembrarCorpusEntrenable } from './fixtures/corpus-entrenable.fixture';
import { PythonEntrenamientoClientStub } from './fixtures/python-entrenamiento.stub';

/**
 * Camino feliz (y uno infeliz a propósito) del orquestador de entrenamiento
 * continuo contra un `PythonEntrenamientoClient` de mentira (F5, ítem 5).
 *
 * `apps/api/test/setup-e2e.ts` deja `PREDICTION_SERVICE_URL` vacía a
 * propósito, así que sin sustituir el cliente el orquestador nunca llega a
 * `POST /entrenar` de verdad — ese escenario («Python apagado», las 4
 * pestañas siguen respondiendo 200) es justo lo que prueba
 * `thesis.e2e-spec.ts`. Esta suite hace lo contrario: sustituye
 * `PythonEntrenamientoClient` por un stub vía `overrideProvider` para probar
 * el resto de la cascada — verificación de pliegues, decisión
 * champion/challenger, persistencia y activación — con Python «disponible».
 *
 * El corpus base de los seeds sólo deja ~60 muestras `anticipado`
 * (`MIN_MUESTRAS` del orquestador exige 200): `sembrarCorpusEntrenable`
 * añade el resto antes del primer test, sin pisar ninguna otra ventana
 * sembrada.
 */
describe('analítica · entrenamiento continuo con Python stub (e2e)', () => {
  let app: INestApplication;
  let stub: PythonEntrenamientoClientStub;
  let token: string;

  beforeAll(async () => {
    stub = new PythonEntrenamientoClientStub();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PythonEntrenamientoClient)
      .useValue(stub)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(crearValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    /* +180 muestras (90 días × 2 turnos) sobre las ~60 del corpus base: por
     * encima de `MIN_MUESTRAS` (200) del orquestador. */
    await sembrarCorpusEntrenable(app, 90);
    token = await login(app, CREDENCIALES.jefe);
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (ruta: string) =>
    request(app.getHttpServer()).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
  const post = (ruta: string) =>
    request(app.getHttpServer()).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);

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

  it('promueve el primer modelo (sin incumbente) cuando Python responde con pliegues correctos', async () => {
    const { body } = await post('/analitica/reentrenar').expect(202);
    expect(body.estado).toBe('entrenando');
    expect(body.version).toMatch(/^v\d+\.\d+$/);

    const final = await esperarReentrenamientoTerminal();
    expect(final.reentrenamiento).toMatchObject({ estado: 'listo', version: body.version });

    const candidata = (final.versiones as { version: string; estado: string; auc: number; f1: number }[]).find(
      (v) => v.version === body.version,
    );
    expect(candidata?.estado).toBe('vigente');
    /* `walkForward.aucRoc` del stub es 0,82; `EntrenamientoContinuoService`
     * lo redondea a 3 decimales al persistirlo. */
    expect(candidata?.auc).toBeCloseTo(0.82, 2);

    /* El guardarraíl de pliegues (contrato §3) pasó de verdad: Python recibió
     * los mismos pliegues walk-forward que Nest calculó, y los ecoa. */
    expect(stub.peticiones.length).toBeGreaterThan(0);
    const peticion = stub.peticiones.at(-1)!;
    expect(peticion.evaluacion.pliegues.length).toBeGreaterThan(0);
    expect(peticion.muestras.length).toBeGreaterThanOrEqual(200);
    expect(peticion.snapshot.filas).toBe(peticion.muestras.length);

    /* La pestaña Modelo ya no está en el estado «sin modelo entrenado». */
    expect(final.metricas.registros).toBeGreaterThanOrEqual(200);
    expect(final.variablesEntrada.length).toBeGreaterThan(0);

    /* El recálculo de predicciones sigue funcionando con un modelo vigente. */
    const recalculado = await post('/analitica/predicciones/recalcular').expect(200);
    const lineas = await get('/lineas').expect(200);
    const activas = (lineas.body.data as { estado: string }[]).filter((l) => l.estado === 'activo');
    expect(recalculado.body.predicciones).toBe(activas.length);
  });

  it('descarta la corrida si los pliegues que devuelve Python no coinciden con los que mandó Nest', async () => {
    stub.forzarPliegues([
      { entrenamientoHasta: '1999-01-01', validacionDesde: '1999-01-02', validacionHasta: '1999-01-03' },
    ]);

    const { body } = await post('/analitica/reentrenar').expect(202);
    const final = await esperarReentrenamientoTerminal();

    expect(final.reentrenamiento).toMatchObject({ estado: 'error', version: body.version });
    expect(final.reentrenamiento.mensaje).toMatch(/[Pp]liegues/);

    /* La corrida se descarta entera: la candidata queda archivada con el
     * motivo, y el campeón de la prueba anterior sigue vigente. */
    const candidata = (final.versiones as { version: string; estado: string }[]).find(
      (v) => v.version === body.version,
    );
    expect(candidata?.estado).toBe('archivada');
    expect((final.versiones as { estado: string }[]).some((v) => v.estado === 'vigente')).toBe(true);
  });
});
