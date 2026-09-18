import { PrediccionCascadaProvider } from './cascada.provider';
import { RuleBasedPredictionProvider } from './rule-based.provider';
import type { PythonHttpPredictionProvider } from './python-http.provider';
import type { PredictionContext, PredictionResult } from './prediction.provider';

/** Subclase de sólo-test: reloj controlable a mano para probar el TTL del
 * precálculo sin depender de temporizadores reales. */
class CascadaConReloj extends PrediccionCascadaProvider {
  reloj = 0;
  protected ahora(): number {
    return this.reloj;
  }
}

function ctx(over: Partial<PredictionContext> = {}): PredictionContext {
  return {
    tipo: 'parada_prevista',
    lineaId: 'LIN-1',
    lineaCodigo: 'LLEN-M1',
    turno: 'D',
    eventos7d: 4,
    eventos30d: 10,
    desvioVelocidadPct: -5,
    oeeActual: 70,
    minutosDesdeCambio: 0,
    ...over,
  };
}

function pythonFake(intentar: jest.Mock): PythonHttpPredictionProvider {
  return { nombre: 'python-http', intentar } as unknown as PythonHttpPredictionProvider;
}

describe('PrediccionCascadaProvider', () => {
  let reglas: RuleBasedPredictionProvider;

  beforeEach(() => {
    reglas = new RuleBasedPredictionProvider();
  });

  it('Python OK: usa su resultado y el nivel queda en python-http', async () => {
    const intentar = jest.fn().mockResolvedValue({ probabilidad: 77, factores: [] });
    const cascada = new PrediccionCascadaProvider(pythonFake(intentar), reglas);

    const resultado = await cascada.predict(ctx());

    expect(resultado).toEqual({ probabilidad: 77, factores: [] });
    expect(cascada.nombre).toBe('cascada:python-http');
    expect(intentar).toHaveBeenCalledTimes(1);
  });

  it('Python caído (intentar devuelve null): cae a reglas y el nivel lo refleja', async () => {
    const intentar = jest.fn().mockResolvedValue(null);
    const cascada = new PrediccionCascadaProvider(pythonFake(intentar), reglas);
    const reglasSpy = jest.spyOn(reglas, 'predict');

    const resultado = await cascada.predict(ctx());

    expect(intentar).toHaveBeenCalledTimes(1);
    expect(reglasSpy).toHaveBeenCalledTimes(1);
    expect(cascada.nombre).toBe('cascada:reglas');
    expect(resultado.probabilidad).toBeGreaterThan(0);
  });

  it('sin PREDICTION_SERVICE_URL (python === null): va directo a reglas sin tocar Python', async () => {
    const cascada = new PrediccionCascadaProvider(null, reglas);
    const reglasSpy = jest.spyOn(reglas, 'predict');

    const resultado = await cascada.predict(ctx());

    expect(cascada.nombre).toBe('cascada:reglas');
    expect(reglasSpy).toHaveBeenCalledTimes(1);
    expect(resultado.probabilidad).toBeGreaterThan(0);
  });

  it('el nombre refleja el nivel de la última llamada, línea a línea', async () => {
    const intentar = jest.fn().mockResolvedValueOnce({ probabilidad: 90, factores: [] }).mockResolvedValueOnce(null);
    const cascada = new PrediccionCascadaProvider(pythonFake(intentar), reglas);

    await cascada.predict(ctx());
    expect(cascada.nombre).toBe('cascada:python-http');

    await cascada.predict(ctx());
    expect(cascada.nombre).toBe('cascada:reglas');
  });

  describe('precalcular (coherencia D5: reutiliza una probabilidad ya calculada)', () => {
    it('una respuesta precargada se reutiliza sin llamar a Python ni a reglas', async () => {
      const intentar = jest.fn();
      const cascada = new PrediccionCascadaProvider(pythonFake(intentar), reglas);
      const reglasSpy = jest.spyOn(reglas, 'predict');
      const c = ctx();
      const resultado: PredictionResult = { probabilidad: 42, factores: [{ texto: 'x', contribucion: 100 }] };

      cascada.precalcular(c, resultado);
      const devuelto = await cascada.predict(c);

      expect(devuelto).toBe(resultado);
      expect(intentar).not.toHaveBeenCalled();
      expect(reglasSpy).not.toHaveBeenCalled();
    });

    it('sólo se consume una vez: la siguiente llamada con el mismo tipo/línea/turno recalcula', async () => {
      const intentar = jest.fn().mockResolvedValue(null);
      const cascada = new PrediccionCascadaProvider(pythonFake(intentar), reglas);
      const c = ctx();

      cascada.precalcular(c, { probabilidad: 42, factores: [] });
      await cascada.predict(c); // consume el precálculo
      await cascada.predict(c); // ya no hay precálculo: recalcula de verdad

      expect(intentar).toHaveBeenCalledTimes(1);
    });

    it('una entrada vencida (fuera del TTL) se descarta y no se reutiliza', async () => {
      const intentar = jest.fn().mockResolvedValue(null);
      const cascada = new CascadaConReloj(pythonFake(intentar), reglas);
      const c = ctx();

      cascada.precalcular(c, { probabilidad: 42, factores: [] });
      cascada.reloj = 6_000; // TTL del precálculo es 5_000 ms

      const resultado = await cascada.predict(c);

      expect(resultado.probabilidad).not.toBe(42);
      expect(intentar).toHaveBeenCalledTimes(1);
    });

    it('no interfiere entre líneas o tipos distintos (la clave incluye tipo+línea+turno)', async () => {
      const intentar = jest.fn().mockResolvedValue(null);
      const cascada = new PrediccionCascadaProvider(pythonFake(intentar), reglas);

      cascada.precalcular(ctx({ lineaId: 'LIN-1' }), { probabilidad: 99, factores: [] });
      const resultado = await cascada.predict(ctx({ lineaId: 'LIN-2' }));

      expect(resultado.probabilidad).not.toBe(99);
      expect(intentar).toHaveBeenCalledTimes(1);
    });
  });
});
