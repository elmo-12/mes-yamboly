import { AlertsEngineService, type SenalLinea } from './alerts-engine.service';
import { RuleBasedPredictionProvider } from './prediction/rule-based.provider';
import type { PredictionContext, PredictionResult } from './prediction';

/** Señal sin desvío de velocidad, OEE sano y pocas paradas: sólo puede disparar `parada_larga`. */
const SENAL: SenalLinea = {
  lineaId: 'LIN-1',
  lineaCodigo: 'LLEN-M1',
  lineaNombre: 'Llenadora M1',
  turno: 'D',
  velocidadReal: 100,
  velocidadEstandar: 100,
  oeeActual: 85,
  eventos7d: 1,
  eventos30d: 4,
  minutosDesdeCambio: 0,
};

const UMBRALES = {
  id: 'UMB-01',
  velocidadBajoEstandarPct: 5,
  oeeMinimo: 75,
  probabilidadMinima: 70,
  alertaParadaLarga: true,
  probabilidadParadaLarga: 25,
};

function construir(umbrales: Partial<typeof UMBRALES>, probabilidad: number) {
  const insertadas: unknown[] = [];
  const alertas = {
    create: jest.fn((x: object) => ({ ...x })),
    /* `insertarCopia` usa `insert` sobre el repositorio. */
    insert: jest.fn(async (x: unknown) => {
      insertadas.push(x);
      return {};
    }),
  };
  const repoUmbrales = { findOne: jest.fn().mockResolvedValue({ ...UMBRALES, ...umbrales }) };
  const prediccion = {
    nombre: 'cascada:python-http',
    predict: jest.fn(async (_ctx: PredictionContext): Promise<PredictionResult> => ({
      probabilidad,
      factores: [{ texto: 'Paradas imprevistas 30 d', contribucion: 100 }],
    })),
  };
  const motor = new AlertsEngineService(alertas as never, repoUmbrales as never, prediccion as never);
  return { motor, prediccion, insertadas };
}

describe('AlertsEngineService — alerta de parada larga', () => {
  it('no la emite si la jefatura no la activó', async () => {
    const { motor, prediccion } = construir({ alertaParadaLarga: false }, 90);
    expect(await motor.evaluar(SENAL)).toEqual([]);
    expect(prediccion.predict).not.toHaveBeenCalled();
  });

  it('la emite con su propio umbral, aunque esté por debajo de probabilidadMinima', async () => {
    const { motor, prediccion } = construir({}, 31);
    const creadas = await motor.evaluar(SENAL);
    expect(prediccion.predict).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'parada_larga' }));
    expect(creadas).toHaveLength(1);
    expect(creadas[0]).toMatchObject({ tipo: 'parada_larga', severidad: 'media', probabilidad: 31 });
  });

  it('no la emite bajo su umbral', async () => {
    const { motor } = construir({ probabilidadParadaLarga: 40 }, 31);
    expect(await motor.evaluar(SENAL)).toEqual([]);
  });

  it('no duplica un tipo que ya tiene alerta viva en la línea', async () => {
    const { motor, prediccion } = construir({}, 90);
    expect(await motor.evaluar(SENAL, new Set(['parada_larga'] as const))).toEqual([]);
    expect(prediccion.predict).not.toHaveBeenCalled();
  });

  it('una alerta viva de otro tipo no bloquea la parada larga', async () => {
    const { motor } = construir({}, 90);
    const creadas = await motor.evaluar(SENAL, new Set(['velocidad_baja'] as const));
    expect(creadas.map((a) => a.tipo)).toEqual(['parada_larga']);
  });

  it('el respaldo por reglas no estima la parada larga (probabilidad 0)', async () => {
    const reglas = new RuleBasedPredictionProvider();
    const ctx: PredictionContext = {
      tipo: 'parada_larga',
      lineaId: 'LIN-1',
      lineaCodigo: 'LLEN-M1',
      turno: 'D',
      eventos7d: 9,
      eventos30d: 30,
      desvioVelocidadPct: -20,
      oeeActual: 40,
      minutosDesdeCambio: 10,
    };
    expect(await reglas.predict(ctx)).toEqual({ probabilidad: 0, factores: [] });
    expect((await reglas.predict({ ...ctx, tipo: 'parada_prevista' })).probabilidad).toBeGreaterThanOrEqual(50);
  });
});
