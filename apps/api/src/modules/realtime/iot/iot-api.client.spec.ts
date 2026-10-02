import type { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../../config/env.validation';
import { IotApiClient } from './iot-api.client';

/* Sin red: `fetch` se sustituye y la URL es inventada. */
function cliente(valores: Partial<Record<keyof EnvVars, unknown>>): IotApiClient {
  const config = { get: (clave: keyof EnvVars) => valores[clave] } as unknown as ConfigService<
    EnvVars,
    true
  >;
  return new IotApiClient(config);
}

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CONFIG = { IOT_API_URL: 'http://iot.prueba.invalid/', IOT_API_KEY: 'clave-falsa' };

describe('IotApiClient', () => {
  const fetchOriginal = global.fetch;
  let fetchFalso: jest.Mock;

  beforeEach(() => {
    fetchFalso = jest.fn();
    global.fetch = fetchFalso as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('sin URL o sin clave queda desactivado y no toca la red', async () => {
    expect(cliente({ IOT_API_URL: '', IOT_API_KEY: 'k' }).configurado()).toBe(false);
    const sinClave = cliente({ IOT_API_URL: 'http://iot.prueba.invalid', IOT_API_KEY: '' });
    expect(sinClave.configurado()).toBe(false);
    expect(await sinClave.estado()).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('pide el estado con la cabecera X-API-Key', async () => {
    fetchFalso.mockResolvedValue(
      respuesta({ ok: true, lineales: [{ nombre: 'L', sensores: [] }] }),
    );
    expect(await cliente(CONFIG).estado()).toHaveLength(1);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://iot.prueba.invalid/api/lineales/estado');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('clave-falsa');
  });

  it('pide el conteo de la lineal en el rango [desde, hasta]', async () => {
    fetchFalso.mockResolvedValue(
      respuesta({
        ok: true,
        total: 1_800,
        parcial: true,
        sensores: [
          { linea_id: 'S_E', conteo: 1_800 },
          { linea_id: 'S_G', conteo: null },
        ],
      }),
    );
    const c = await cliente(CONFIG).conteo(
      'MOLDEADORA A3',
      '2026-10-02T11:00:00.000Z',
      '2026-10-02T15:01:00.000Z',
    );
    expect(c).toEqual({ total: 1_800, parcial: true, sinReferencia: ['S_G'] });
    const [url] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://iot.prueba.invalid/api/lineales/MOLDEADORA%20A3/conteo' +
        '?desde=2026-10-02T11%3A00%3A00.000Z&hasta=2026-10-02T15%3A01%3A00.000Z',
    );
  });

  it('`total: null` del IoT es "sin dato", no cero', async () => {
    fetchFalso.mockResolvedValue(respuesta({ ok: true, total: null, sensores: [] }));
    const c = await cliente(CONFIG).conteo('L', 'a', 'b');
    expect(c?.total).toBeNull();
  });

  it('un HTTP de error o un fallo de red devuelven null', async () => {
    const c = cliente(CONFIG);
    fetchFalso.mockResolvedValueOnce(respuesta({ ok: false }, 401));
    expect(await c.lineales()).toBeNull();
    fetchFalso.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await c.lineales()).toBeNull();
  });

  /**
   * La integración con el IoT es ESTRICTAMENTE de sólo lectura (decisión del
   * usuario). Esta prueba falla si cualquier método público del cliente hace
   * una petición que no sea GET, o si aparece un método público nuevo sin
   * pasar por aquí.
   */
  it('sólo hace peticiones GET (ninguna escritura en el IoT)', async () => {
    fetchFalso.mockImplementation((_url: string, init?: RequestInit) => {
      const metodo = (init?.method ?? 'GET').toUpperCase();
      if (metodo !== 'GET') throw new Error(`Escritura prohibida en el IoT: ${metodo}`);
      if (init?.body !== undefined) throw new Error('Un GET al IoT no lleva cuerpo');
      return Promise.resolve(respuesta({ ok: true, lineales: [], total: 0, sensores: [] }));
    });
    const c = cliente(CONFIG);

    const publicos = Object.getOwnPropertyNames(IotApiClient.prototype).filter(
      (m) => m !== 'constructor' && !['base', 'clave', 'pedir', 'avisarFallo'].includes(m),
    );
    expect(publicos.sort()).toEqual([
      'configurado',
      'conteo',
      'estado',
      'lineales',
      'lineasConfiguradas',
    ]);

    await c.lineales();
    await c.estado();
    await c.conteo('MOLDEADORA A3', '2026-10-02T11:00:00.000Z', '2026-10-02T15:00:00.000Z');
    expect(fetchFalso).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchFalso.mock.calls as [string, RequestInit][]) {
      expect(init.method).toBe('GET');
    }
  });
});
