import {
  calcularLecturaLinea,
  normalizarNombre,
  parsearMapeoLineas,
  resolverLineal,
  sensorEnLinea,
  type ConteoOrdenIot,
  type EstadoLinealIot,
  type EstadoSensorIot,
  type LinealIot,
} from './sensores-iot.util';

/* Datos inventados: nada de esto sale del IoT real. */
const AHORA = Date.parse('2026-10-02T15:00:00.000Z');
const haceSeg = (s: number) => new Date(AHORA - s * 1000).toISOString();

function sensor(id: string, total: number, extra: Partial<EstadoSensorIot> = {}): EstadoSensorIot {
  return {
    linea_id: id,
    server_total: total,
    online: true,
    state: 1,
    last_count_at_utc: haceSeg(5),
    last_seen_at: haceSeg(5),
    reportado: true,
    ...extra,
  };
}

function lineal(
  sensores: EstadoSensorIot[],
  velocidadUph: number | null = 20_812,
): EstadoLinealIot {
  return {
    id: 1,
    nombre: 'MOLDEADORA A3',
    server_total: sensores.reduce((a, s) => a + s.server_total, 0),
    online: sensores.some((s) => s.online),
    last_count_at_utc: haceSeg(5),
    velocidad_uph: velocidadUph,
    sensores,
  };
}

function conteo(total: number | null, sinReferencia: string[] = []): ConteoOrdenIot {
  return { total, parcial: sinReferencia.length > 0, sinReferencia };
}

const CATALOGO: LinealIot[] = [
  { id: 1, nombre: 'MOLDEADORA A3', sensores: ['S_E', 'S_F', 'S_G'] },
  { id: 2, nombre: 'MOLDEADORA A2', sensores: ['S_C', 'S_D'] },
  { id: 3, nombre: 'EXTRUSORA 3', sensores: ['S_I', 'S_J'] },
  { id: 4, nombre: 'LLENADORA M1', sensores: [] },
];

describe('sensorEnLinea (ventana de gracia del LWT)', () => {
  it('online por LWT', () => {
    expect(sensorEnLinea(sensor('S', 0), AHORA)).toBe(true);
  });

  it('LWT caído pero reportó hace 1 min: sigue en línea (microcorte WiFi)', () => {
    expect(sensorEnLinea(sensor('S', 0, { online: false, last_seen_at: haceSeg(60) }), AHORA)).toBe(
      true,
    );
  });

  it('LWT caído y sin reportar desde hace 4 min: caído de verdad', () => {
    expect(
      sensorEnLinea(
        sensor('S', 0, {
          online: false,
          last_seen_at: haceSeg(240),
          last_count_at_utc: haceSeg(300),
        }),
        AHORA,
      ),
    ).toBe(false);
  });

  it('nunca reportó: caído', () => {
    expect(
      sensorEnLinea(
        sensor('S', 0, { online: false, last_seen_at: null, last_count_at_utc: null }),
        AHORA,
      ),
    ).toBe(false);
  });
});

describe('mapeo línea MES ↔ lineal IoT', () => {
  it('normaliza mayúsculas, tildes y espacios', () => {
    expect(normalizarNombre('  Moldeadora   A3 ')).toBe('MOLDEADORA A3');
    expect(normalizarNombre('Extrusora 3')).toBe(normalizarNombre('EXTRUSORA 3'));
  });

  it('sin IOT_LINEAS enlaza por nombre todas las líneas con sensores', () => {
    const mapeo = parsearMapeoLineas('');
    expect(mapeo).toBeNull();
    expect(resolverLineal({ id: 'LIN-MOLD-A3', nombre: 'Moldeadora A3' }, mapeo, CATALOGO)).toBe(
      'MOLDEADORA A3',
    );
    expect(resolverLineal({ id: 'LIN-EXTR-3', nombre: 'Extrusora 3' }, mapeo, CATALOGO)).toBe(
      'EXTRUSORA 3',
    );
    /* Lineal sin sensores asignados: como si no existiera. */
    expect(
      resolverLineal({ id: 'LIN-LLEN-M1', nombre: 'Llenadora M1' }, mapeo, CATALOGO),
    ).toBeNull();
    expect(
      resolverLineal({ id: 'LIN-LLEN-A1', nombre: 'Llenadora A1' }, mapeo, CATALOGO),
    ).toBeNull();
  });

  it('con IOT_LINEAS sólo habilita las líneas listadas', () => {
    const mapeo = parsearMapeoLineas('LIN-MOLD-A3');
    expect(resolverLineal({ id: 'LIN-MOLD-A3', nombre: 'Moldeadora A3' }, mapeo, CATALOGO)).toBe(
      'MOLDEADORA A3',
    );
    expect(
      resolverLineal({ id: 'LIN-MOLD-A2', nombre: 'Moldeadora A2' }, mapeo, CATALOGO),
    ).toBeNull();
  });

  it('admite un nombre de lineal explícito', () => {
    const mapeo = parsearMapeoLineas(' LIN-X = moldeadora a2 , LIN-MOLD-A3');
    expect(mapeo?.get('LIN-X')).toBe('moldeadora a2');
    expect(mapeo?.get('LIN-MOLD-A3')).toBeNull();
    expect(resolverLineal({ id: 'LIN-X', nombre: 'Otra' }, mapeo, CATALOGO)).toBe('MOLDEADORA A2');
  });
});

describe('calcularLecturaLinea', () => {
  const comun = { lineal: 'MOLDEADORA A3', consultado: true, conOrden: true, ahoraMs: AHORA };
  const tresSensores = () =>
    lineal([sensor('S_E', 10_500), sensor('S_F', 20_300), sensor('S_G', 7_000)]);

  it('toma el conteo de la orden del IoT y pasa u/h a u/min', () => {
    const r = calcularLecturaLinea({ ...comun, vivo: tresSensores(), conteo: conteo(1_800) });
    expect(r.producido).toBe(1_800);
    expect(r.velocidadUnidMin).toBe(346.9); // 20 812 u/h ÷ 60
    expect(r.sensores).toMatchObject({ total: 3, enLinea: 3, estado: 'ok', consultado: true });
    expect(r.sensores.sensores.map((s) => s.id)).toEqual(['S_E', 'S_F', 'S_G']);
    expect(r.sensores.ultimaLectura).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('un sensor con el LWT parpadeando no rebaja el recuento', () => {
    const r = calcularLecturaLinea({
      ...comun,
      vivo: lineal([
        sensor('S_E', 1),
        sensor('S_F', 1, { online: false, last_seen_at: haceSeg(20) }),
        sensor('S_G', 1, {
          online: false,
          last_seen_at: haceSeg(3_600),
          last_count_at_utc: haceSeg(3_600),
        }),
      ]),
      conteo: conteo(3),
    });
    expect(r.sensores.enLinea).toBe(2);
    expect(r.sensores.sensores.find((s) => s.id === 'S_G')?.enLinea).toBe(false);
    expect(r.sensores.estado).toBe('ok');
  });

  it('sensor sin snapshot previo al inicio: conteo parcial', () => {
    const r = calcularLecturaLinea({
      ...comun,
      vivo: tresSensores(),
      conteo: conteo(900, ['S_G']),
    });
    expect(r.producido).toBe(900);
    expect(r.sensores.estado).toBe('parcial');
  });

  it('contador que retrocede: inconsistente, sin conteo pero con velocidad', () => {
    const r = calcularLecturaLinea({
      ...comun,
      vivo: tresSensores(),
      conteo: conteo(50),
      retrocedio: true,
    });
    expect(r.producido).toBeNull();
    expect(r.velocidadUnidMin).not.toBeNull();
    expect(r.sensores.estado).toBe('inconsistente');
  });

  it('sin conteo del IoT (fallo o total null): sin_conteo, nunca 0', () => {
    for (const c of [undefined, conteo(null, ['S_E', 'S_F', 'S_G'])]) {
      const r = calcularLecturaLinea({ ...comun, vivo: tresSensores(), conteo: c });
      expect(r.producido).toBeNull();
      expect(r.sensores.estado).toBe('sin_conteo');
    }
  });

  it('todos los sensores caídos: conserva el último conteo y marca sensor_offline', () => {
    const caido = { online: false, last_seen_at: haceSeg(900), last_count_at_utc: haceSeg(900) };
    const r = calcularLecturaLinea({
      ...comun,
      vivo: lineal([sensor('S_E', 70, caido), sensor('S_F', 30, caido)], null),
      conteo: conteo(100),
    });
    expect(r.producido).toBe(100);
    expect(r.velocidadUnidMin).toBeNull();
    expect(r.sensores).toMatchObject({ enLinea: 0, total: 2, estado: 'sensor_offline' });
  });

  it('IoT sin respuesta: api_caida y ningún dato (nunca "0 producido")', () => {
    const r = calcularLecturaLinea({
      ...comun,
      consultado: false,
      vivo: tresSensores(),
      conteo: conteo(50),
    });
    expect(r.producido).toBeNull();
    expect(r.velocidadUnidMin).toBeNull();
    expect(r.sensores).toMatchObject({ consultado: false, total: 0, estado: 'api_caida' });
  });

  it('sin orden en curso: informa los sensores pero no conteo ni velocidad', () => {
    const r = calcularLecturaLinea({
      ...comun,
      conOrden: false,
      vivo: lineal([sensor('S_E', 50)]),
      conteo: undefined,
    });
    expect(r).toMatchObject({ producido: null, velocidadUnidMin: null });
    expect(r.sensores).toMatchObject({ total: 1, enLinea: 1, estado: 'sin_orden' });
  });
});
