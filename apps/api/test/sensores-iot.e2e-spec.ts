import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { EnvVars } from '../src/config/env.validation';
import { IotApiClient } from '../src/modules/realtime/iot/iot-api.client';
import type { EstadoLinealIot, LinealIot } from '../src/modules/realtime/iot/sensores-iot.util';
import { crearApp, login } from './app.factory';

/**
 * Sensores IoT en el tablero de Tiempo real, sin red: se usa el `IotApiClient`
 * real contra un `fetch` falso que responde con datos inventados (sensores
 * `S_*`, URL `.invalid`) y que FALLA ante cualquier método distinto de GET,
 * porque la integración es estrictamente de sólo lectura.
 */

interface LineaRespuesta {
  lineaId: string;
  estado: string;
  producido: number;
  velocidad: number;
  fuenteProduccion?: string;
  fuenteVelocidad?: string;
  sensores?: {
    lineal: string;
    consultado: boolean;
    total: number;
    enLinea: number;
    estado: string;
    sensores: { id: string; enLinea: boolean }[];
  };
}

const CATALOGO: LinealIot[] = [
  { id: 1, nombre: 'MOLDEADORA A3', sensores: ['S_E', 'S_F', 'S_G'] },
  { id: 2, nombre: 'EXTRUSORA 3', sensores: ['S_I', 'S_J'] },
  /* Lineal sin sensores asignados: no debe enlazarse. */
  { id: 3, nombre: 'LLENADORA A1', sensores: [] },
];

function estadoA3(): EstadoLinealIot {
  const ahora = new Date().toISOString();
  const viejo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const s = (id: string, total: number, online = true, visto = ahora) => ({
    linea_id: id,
    server_total: total,
    online,
    state: 1,
    last_count_at_utc: visto,
    last_seen_at: visto,
    reportado: true,
    velocidad_uph: 7_000,
  });
  return {
    id: 1,
    nombre: 'MOLDEADORA A3',
    server_total: 0,
    online: true,
    last_count_at_utc: ahora,
    velocidad_uph: 21_000,
    sensores: [
      s('S_E', 1_500),
      /* LWT caído hace segundos (microcorte): debe contar como en línea. */
      s('S_F', 2_600, false),
      /* Sin reportar desde hace una hora: caído de verdad. */
      s('S_G', 3_700, false, viejo),
    ],
  };
}

/** Servidor IoT simulado: registra cada petición y rechaza las escrituras. */
class IotFalso {
  peticiones: Array<{ metodo: string; url: URL }> = [];
  escrituras = 0;
  constructor(private readonly responde: boolean) {}

  readonly fetch = async (entrada: string, init?: RequestInit): Promise<Response> => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const url = new URL(entrada);
    this.peticiones.push({ metodo, url });
    if (metodo !== 'GET') {
      this.escrituras++;
      throw new Error(`Escritura prohibida en el IoT: ${metodo} ${url.pathname}`);
    }
    if (!this.responde) return json({ ok: false, error: 'caido' }, 503);
    if (url.pathname === '/api/lineales') return json({ ok: true, lineales: CATALOGO });
    if (url.pathname === '/api/lineales/estado') {
      return json({
        ok: true,
        lineales: [
          estadoA3(),
          {
            id: 2,
            nombre: 'EXTRUSORA 3',
            server_total: 0,
            online: false,
            last_count_at_utc: null,
            sensores: [],
          },
        ],
      });
    }
    if (url.pathname === '/api/lineales/MOLDEADORA%20A3/conteo') {
      return json({
        ok: true,
        total: 1_800,
        parcial: false,
        sensores: [
          { linea_id: 'S_E', conteo: 500 },
          { linea_id: 'S_F', conteo: 600 },
          { linea_id: 'S_G', conteo: 700 },
        ],
      });
    }
    return json({ ok: false, error: 'lineal_no_encontrada' }, 404);
  };
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Cliente real con una configuración inventada (nunca la del `.env`). */
function clienteFalso(iotLineas?: string): IotApiClient {
  const valores: Partial<Record<keyof EnvVars, unknown>> = {
    IOT_API_URL: 'http://iot.prueba.invalid',
    IOT_API_KEY: 'clave-falsa',
    IOT_TIMEOUT_MS: 1000,
    IOT_LINEAS: iotLineas,
  };
  return new IotApiClient({
    get: (clave: keyof EnvVars) => valores[clave],
  } as unknown as ConfigService<EnvVars, true>);
}

async function lineas(app: INestApplication, token: string): Promise<Map<string, LineaRespuesta>> {
  const { body } = await request(app.getHttpServer())
    .get('/api/v1/tiempo-real/lineas')
    .set({ Authorization: `Bearer ${token}` })
    .expect(200);
  return new Map((body.lineas as LineaRespuesta[]).map((l) => [l.lineaId, l]));
}

describe('sensores IoT en Tiempo real (e2e)', () => {
  describe('con el IoT respondiendo', () => {
    let app: INestApplication;
    let token: string;
    const iot = new IotFalso(true);
    const fetchOriginal = global.fetch;

    beforeAll(async () => {
      global.fetch = iot.fetch as unknown as typeof fetch;
      app = await crearApp((b) => b.overrideProvider(IotApiClient).useValue(clienteFalso()));
      token = await login(app);
    });

    afterAll(async () => {
      await app.close();
      global.fetch = fetchOriginal;
    });

    it('MOLD-A3 toma producido y velocidad de los sensores', async () => {
      const a3 = (await lineas(app, token)).get('LIN-MOLD-A3')!;
      /* Conteo del IoT = 500 + 600 + 700; 21 000 u/h = 350 u/min. */
      expect(a3.producido).toBe(1_800);
      expect(a3.velocidad).toBe(350);
      expect(a3.fuenteProduccion).toBe('sensores');
      expect(a3.fuenteVelocidad).toBe('sensores');
      expect(a3.sensores).toMatchObject({
        lineal: 'MOLDEADORA A3',
        consultado: true,
        total: 3,
        enLinea: 2,
        estado: 'ok',
      });
      /* La parada abierta registrada a mano sigue mandando en el estado. */
      expect(a3.estado).toBe('parada');
    });

    it('pide el conteo de la orden en curso desde su inicio, sólo con GET', async () => {
      await lineas(app, token);
      expect(iot.escrituras).toBe(0);
      expect(iot.peticiones.every((p) => p.metodo === 'GET')).toBe(true);
      expect(iot.peticiones.some((p) => p.url.pathname.endsWith('/bases'))).toBe(false);
      const conteo = iot.peticiones.find((p) => p.url.pathname.endsWith('/conteo'));
      /* Inicio de ORD-0812 (seed: 06:00 de Lima del día operativo) en UTC (−5 h
       * fijo), sea cual sea la TZ del proceso. */
      expect(conteo?.url.searchParams.get('desde')).toBe('2026-08-28T11:00:00.000Z');
      expect(Date.parse(conteo!.url.searchParams.get('hasta')!)).toBeGreaterThan(Date.now());
    });

    it('las líneas sin sensores siguen como antes', async () => {
      const todas = await lineas(app, token);
      const llenA1 = todas.get('LIN-LLEN-A1')!;
      expect(llenA1.sensores).toBeUndefined();
      expect(llenA1.fuenteProduccion).toBeUndefined();
      /* EXTR-3 está en el catálogo con sensores: se enlaza por nombre. */
      expect(todas.get('LIN-EXTR-3')?.sensores?.lineal).toBe('EXTRUSORA 3');
    });

    it('el modo TV refleja el conteo de los sensores', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/v1/tiempo-real/tv')
        .set({ Authorization: `Bearer ${token}` })
        .expect(200);
      const fila = (body.filas as { lineaId: string; producido: number }[]).find(
        (f) => f.lineaId === 'LIN-MOLD-A3',
      );
      expect(fila?.producido).toBe(1_800);
    });
  });

  describe('con el IoT caído', () => {
    let app: INestApplication;
    const fetchOriginal = global.fetch;
    let token: string;

    beforeAll(async () => {
      global.fetch = new IotFalso(false).fetch as unknown as typeof fetch;
      app = await crearApp((b) =>
        b.overrideProvider(IotApiClient).useValue(clienteFalso('LIN-MOLD-A3')),
      );
      token = await login(app);
    });

    afterAll(async () => {
      await app.close();
      global.fetch = fetchOriginal;
    });

    it('cae a los registros manuales y lo marca como api_caida', async () => {
      const todas = await lineas(app, token);
      const a3 = todas.get('LIN-MOLD-A3')!;
      /* Producido manual del seed (ORD-0812), no un cero. */
      expect(a3.producido).toBe(148_200);
      expect(a3.fuenteProduccion).toBe('manual');
      expect(a3.sensores).toMatchObject({ consultado: false, estado: 'api_caida' });
      /* Sólo la línea listada en IOT_LINEAS: el resto, sin sensores. */
      expect(todas.get('LIN-EXTR-3')?.sensores).toBeUndefined();
    });
  });
});
