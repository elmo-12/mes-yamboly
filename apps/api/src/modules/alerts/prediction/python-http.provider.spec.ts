import { PythonHttpPredictionProvider } from './python-http.provider';
import { RuleBasedPredictionProvider } from './rule-based.provider';
import type { PredictionContext } from './prediction.provider';

/** Subclase de sólo-test: sustituye el reloj real por uno controlable a mano,
 * para que las pruebas del circuit breaker sean deterministas (sin `sleep`). */
class ProviderConReloj extends PythonHttpPredictionProvider {
  reloj = 0;
  protected ahora(): number {
    return this.reloj;
  }
}

function ctx(): PredictionContext {
  return {
    tipo: 'parada_prevista',
    lineaId: 'LIN-1',
    lineaCodigo: 'LLEN-M1',
    turno: 'D',
    eventos7d: 3,
    eventos30d: 9,
    desvioVelocidadPct: -4.2,
    oeeActual: 71.3,
    minutosDesdeCambio: 0,
  };
}

function respuesta(body: unknown, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('PythonHttpPredictionProvider', () => {
  let fetchMock: jest.Mock;
  let fallback: RuleBasedPredictionProvider;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    fallback = new RuleBasedPredictionProvider();
  });

  it('Python OK: devuelve la probabilidad y los factores tal cual', async () => {
    fetchMock.mockResolvedValue(
      respuesta({ probabilidad: 63.4, factores: [{ texto: 'Paradas imprevistas 7 d', contribucion: 100 }] }),
    );
    const provider = new PythonHttpPredictionProvider(fallback, 'http://python:8000', 1500);
    const resultado = await provider.intentar(ctx());
    expect(resultado).toEqual({
      probabilidad: 63.4,
      factores: [{ texto: 'Paradas imprevistas 7 d', contribucion: 100 }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://python:8000/predict');
  });

  it('sin PREDICTION_SERVICE_URL: no hace fetch y devuelve null', async () => {
    const provider = new PythonHttpPredictionProvider(fallback, undefined, 1500);
    expect(await provider.intentar(ctx())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Python caído (error de red/timeout): devuelve null sin lanzar', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new PythonHttpPredictionProvider(fallback, 'http://python:8000', 1500);
    await expect(provider.intentar(ctx())).resolves.toBeNull();
  });

  it('respuesta inválida: probabilidad fuera de [0,100] -> null', async () => {
    fetchMock.mockResolvedValue(respuesta({ probabilidad: 140, factores: [] }));
    const provider = new PythonHttpPredictionProvider(fallback, 'http://python:8000', 1500);
    expect(await provider.intentar(ctx())).toBeNull();
  });

  it('respuesta inválida: probabilidad no finita (NaN/Infinity) -> null', async () => {
    fetchMock.mockResolvedValue(respuesta({ probabilidad: Number.POSITIVE_INFINITY, factores: [] }));
    const provider = new PythonHttpPredictionProvider(fallback, 'http://python:8000', 1500);
    expect(await provider.intentar(ctx())).toBeNull();
  });

  it('respuesta inválida: factor con contribucion fuera de [0,100] -> null', async () => {
    fetchMock.mockResolvedValue(
      respuesta({ probabilidad: 50, factores: [{ texto: 'x', contribucion: 250 }] }),
    );
    const provider = new PythonHttpPredictionProvider(fallback, 'http://python:8000', 1500);
    expect(await provider.intentar(ctx())).toBeNull();
  });

  it('respuesta inválida: factor sin texto de tipo string -> null', async () => {
    fetchMock.mockResolvedValue(respuesta({ probabilidad: 50, factores: [{ contribucion: 10 }] }));
    const provider = new PythonHttpPredictionProvider(fallback, 'http://python:8000', 1500);
    expect(await provider.intentar(ctx())).toBeNull();
  });

  it('422 (tipo no soportado): null, log en debug (no warn) y no cuenta para el breaker', async () => {
    fetchMock.mockResolvedValue(respuesta({ detail: 'tipo no soportado' }, 422));
    const provider = new ProviderConReloj(fallback, 'http://python:8000', 1500, 3, 60_000);
    const logger = (provider as unknown as { logger: { warn: jest.Mock; debug: jest.Mock } }).logger;
    const warnSpy = jest.spyOn(logger, 'warn');
    const debugSpy = jest.spyOn(logger, 'debug');

    for (let i = 0; i < 5; i += 1) {
      expect(await provider.intentar(ctx())).toBeNull();
    }

    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(5);
    /* Cinco 422 seguidos no deben abrir el circuito: siempre hace fetch. */
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('503 (sin modelo activo): null, cuenta como fallo real y puede abrir el circuito', async () => {
    fetchMock.mockResolvedValue(respuesta({ detail: 'sin modelo activo' }, 503));
    const provider = new ProviderConReloj(fallback, 'http://python:8000', 1500, 3, 60_000);

    await provider.intentar(ctx());
    await provider.intentar(ctx());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await provider.intentar(ctx()); // 3er 503: abre el circuito
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await provider.intentar(ctx()); // circuito abierto: no debe volver a llamar a fetch
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe('circuit breaker', () => {
    it('se abre tras N fallos consecutivos y deja de hacer fetch', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      const provider = new ProviderConReloj(fallback, 'http://python:8000', 1500, 3, 60_000);

      await provider.intentar(ctx());
      await provider.intentar(ctx());
      await provider.intentar(ctx());
      expect(fetchMock).toHaveBeenCalledTimes(3);

      await provider.intentar(ctx());
      await provider.intentar(ctx());
      expect(fetchMock).toHaveBeenCalledTimes(3); // ninguna de las dos llamó a fetch
    });

    it('pasado el periodo abierto deja pasar una petición de prueba y se cierra si tiene éxito', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      const provider = new ProviderConReloj(fallback, 'http://python:8000', 1500, 3, 60_000);

      await provider.intentar(ctx());
      await provider.intentar(ctx());
      await provider.intentar(ctx());
      expect(fetchMock).toHaveBeenCalledTimes(3);

      provider.reloj = 60_001; // vence el periodo abierto
      fetchMock.mockResolvedValueOnce(respuesta({ probabilidad: 10, factores: [] }));
      const resultado = await provider.intentar(ctx());
      expect(resultado).toEqual({ probabilidad: 10, factores: [] });
      expect(fetchMock).toHaveBeenCalledTimes(4); // dejó pasar la prueba

      // circuito cerrado: la próxima llamada vuelve a golpear la red con normalidad
      fetchMock.mockResolvedValueOnce(respuesta({ probabilidad: 20, factores: [] }));
      await provider.intentar(ctx());
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('si la petición de prueba en medio-abierto falla, reabre el circuito', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      const provider = new ProviderConReloj(fallback, 'http://python:8000', 1500, 3, 60_000);

      await provider.intentar(ctx());
      await provider.intentar(ctx());
      await provider.intentar(ctx());
      expect(fetchMock).toHaveBeenCalledTimes(3);

      provider.reloj = 60_001;
      await provider.intentar(ctx()); // medio-abierto: deja pasar, pero vuelve a fallar
      expect(fetchMock).toHaveBeenCalledTimes(4);

      await provider.intentar(ctx()); // reabierto de inmediato: no llama a fetch
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('predict() cae al proveedor de reglas cuando el circuito está abierto', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      const provider = new ProviderConReloj(fallback, 'http://python:8000', 1500, 1, 60_000);

      await provider.predict(ctx()); // 1 fallo: abre el circuito (umbral 1)
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const resultado = await provider.predict(ctx());
      expect(fetchMock).toHaveBeenCalledTimes(1); // no repite fetch: circuito abierto
      expect(resultado.probabilidad).toBeGreaterThan(0); // lo resolvió `reglas`
    });
  });
});
