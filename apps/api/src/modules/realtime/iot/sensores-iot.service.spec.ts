import { instanteDePlanta } from '@mes/shared';
import type { IotApiClient } from './iot-api.client';
import { SensoresIotService } from './sensores-iot.service';
import type { ConteoOrdenIot, EstadoLinealIot } from './sensores-iot.util';

/* Cliente falso, sin red: sólo lo que el servicio necesita leer. */
function clienteFalso(conteos: Array<ConteoOrdenIot | null>) {
  const llamadas = { lineales: 0, estado: 0, conteo: 0 };
  /* Ventanas [desde, hasta] pedidas al IoT, en el orden de las llamadas. */
  const ventanas: Array<{ lineal: string; desde: string; hasta: string }> = [];
  const estado: EstadoLinealIot = {
    id: 1,
    nombre: 'MOLDEADORA A3',
    server_total: 0,
    online: true,
    last_count_at_utc: null,
    velocidad_uph: 21_000,
    sensores: [
      {
        linea_id: 'S_E',
        server_total: 0,
        online: true,
        state: 1,
        last_count_at_utc: null,
        last_seen_at: null,
        reportado: true,
      },
    ],
  };
  const cliente = {
    configurado: () => true,
    lineasConfiguradas: () => 'LIN-MOLD-A3',
    lineales: async () => {
      llamadas.lineales++;
      return [{ id: 1, nombre: 'MOLDEADORA A3', sensores: ['S_E'] }];
    },
    estado: async () => {
      llamadas.estado++;
      return [estado];
    },
    conteo: async (lineal: string, desde: string, hasta: string) => {
      ventanas.push({ lineal, desde, hasta });
      return conteos[Math.min(llamadas.conteo++, conteos.length - 1)];
    },
  };
  return { cliente: cliente as unknown as IotApiClient, llamadas, ventanas };
}

const LINEAS = [
  {
    id: 'LIN-MOLD-A3',
    nombre: 'Moldeadora A3',
    ordenEnCurso: { id: 'ORD-1', inicio: '2026-10-02T06:00:00' },
  },
  { id: 'LIN-LLEN-A1', nombre: 'Llenadora A1', ordenEnCurso: null },
];

describe('SensoresIotService', () => {
  let reloj = Date.parse('2026-10-02T15:00:00Z');
  beforeEach(() => {
    reloj = Date.parse('2026-10-02T15:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => reloj);
  });
  afterEach(() => jest.restoreAllMocks());

  const c = (total: number): ConteoOrdenIot => ({ total, parcial: false, sinReferencia: [] });

  it('cachea estado (5 s) y conteo (10 s) entre pantallas', async () => {
    const { cliente, llamadas } = clienteFalso([c(100), c(150)]);
    const servicio = new SensoresIotService(cliente);

    const primera = await servicio.lecturas(LINEAS);
    expect(primera.get('LIN-MOLD-A3')?.producido).toBe(100);
    expect(primera.has('LIN-LLEN-A1')).toBe(false);

    reloj += 4_000;
    await servicio.lecturas(LINEAS);
    expect(llamadas).toEqual({ lineales: 1, estado: 1, conteo: 1 });

    reloj += 7_000;
    const tercera = await servicio.lecturas(LINEAS);
    expect(llamadas).toMatchObject({ estado: 2, conteo: 2 });
    expect(tercera.get('LIN-MOLD-A3')?.producido).toBe(150);
  });

  it('un conteo que baja respecto a uno ya visto marca la orden como inconsistente', async () => {
    const { cliente } = clienteFalso([c(500), c(20)]);
    const servicio = new SensoresIotService(cliente);
    await servicio.lecturas(LINEAS);
    reloj += 11_000;
    const r = (await servicio.lecturas(LINEAS)).get('LIN-MOLD-A3');
    expect(r?.producido).toBeNull();
    expect(r?.sensores.estado).toBe('inconsistente');
  });

  it('un fallo suelto del conteo conserva la última lectura buena', async () => {
    const { cliente } = clienteFalso([c(300), null]);
    const servicio = new SensoresIotService(cliente);
    await servicio.lecturas(LINEAS);
    reloj += 11_000;
    expect((await servicio.lecturas(LINEAS)).get('LIN-MOLD-A3')?.producido).toBe(300);
    /* Pasados 30 s sin respuesta buena, deja de ser de fiar. */
    reloj += 25_000;
    const r = (await servicio.lecturas(LINEAS)).get('LIN-MOLD-A3');
    expect(r?.producido).toBeNull();
    expect(r?.sensores.estado).toBe('sin_conteo');
  });

  /* Debe pasar igual con `TZ=UTC` (despliegue) y `TZ=America/Lima` (equipo de
   * desarrollo): el inicio de la orden es hora de pared de Lima sin zona. */
  it(`pide el conteo desde el inicio de la orden en hora de Lima (TZ=${process.env.TZ ?? 'local'})`, async () => {
    const { cliente, ventanas } = clienteFalso([c(100)]);
    const servicio = new SensoresIotService(cliente);
    await servicio.lecturas(LINEAS);
    expect(ventanas).toHaveLength(1);
    /* 06:00 en Lima (UTC−5) son las 11:00 UTC, sea cual sea la TZ del proceso. */
    expect(ventanas[0]?.desde).toBe('2026-10-02T11:00:00.000Z');
    expect(Date.parse(ventanas[0]!.hasta)).toBeGreaterThanOrEqual(reloj);
  });

  it('instanteDePlanta convierte la hora de pared de Lima a UTC y respeta la zona explícita', () => {
    expect(instanteDePlanta('2026-10-02T23:30:00')?.toISOString()).toBe('2026-10-03T04:30:00.000Z');
    expect(instanteDePlanta('2026-10-02T06:00')?.toISOString()).toBe('2026-10-02T11:00:00.000Z');
    expect(instanteDePlanta('2026-10-02T06:00:00Z')?.toISOString()).toBe('2026-10-02T06:00:00.000Z');
    expect(instanteDePlanta('no-es-fecha')).toBeNull();
  });
});
