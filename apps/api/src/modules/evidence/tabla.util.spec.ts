import { aFecha, aNumero, isoLocal } from './tabla.util';

/** Lee una fecha y la devuelve como ISO de pared (o `null`). */
const leer = (valor: Parameters<typeof aFecha>[0]): string | null => {
  const fecha = aFecha(valor);
  return fecha ? isoLocal(fecha) : null;
};

describe('tabla.util · fechas de las fuentes externas', () => {
  const tzOriginal = process.env.TZ;
  afterAll(() => {
    process.env.TZ = tzOriginal;
  });

  /* El resultado no puede depender de la TZ del proceso (QA corre en −05,
     el despliegue en UTC). */
  describe.each(['UTC', 'America/Lima', 'Asia/Tokyo'])('con TZ=%s', (tz) => {
    beforeAll(() => {
      process.env.TZ = tz;
    });

    it('la celda fecha de Excel (exceljs la entrega en UTC) es hora de pared', () => {
      expect(leer(new Date(Date.UTC(2026, 8, 11, 10, 18, 0)))).toBe('2026-09-11T10:18:00');
    });

    it('serie numérica, ISO y dd/mm/aaaa coinciden', () => {
      expect(leer(46276.4416666667)).toBe('2026-09-11T10:36:00');
      expect(leer('2026-09-11T08:15:30')).toBe('2026-09-11T08:15:30');
      expect(leer('2026-09-11 08:15:30.000Z')).toBe('2026-09-11T08:15:30');
      expect(leer('11/09/2026 10:18')).toBe('2026-09-11T10:18:00');
      expect(leer('11-09-26 09:00')).toBe('2026-09-11T09:00:00');
      expect(leer('11/09/2026')).toBe('2026-09-11T00:00:00');
    });
  });

  it('rechaza fechas y horas imposibles en vez de «correrlas»', () => {
    expect(leer('31/02/2026 10:00')).toBeNull();
    expect(leer('2026-13-45 10:00')).toBeNull();
    expect(leer('2026-02-29')).toBeNull();
    expect(leer('11/09/2026 25:70')).toBeNull();
    expect(leer('11/09/2026 10:60')).toBeNull();
    expect(leer('ayer')).toBeNull();
    expect(leer('2028-02-29')).toBe('2028-02-29T00:00:00');
  });

  it('admite AM/PM, incluidas las variantes en español', () => {
    expect(leer('11/09/2026 7:05 PM')).toBe('2026-09-11T19:05:00');
    expect(leer('11/09/2026 7:05 p. m.')).toBe('2026-09-11T19:05:00');
    expect(leer('11/09/2026 12:00 AM')).toBe('2026-09-11T00:00:00');
    expect(leer('11/09/2026 12:30 pm')).toBe('2026-09-11T12:30:00');
    expect(leer('11/09/2026 13:00 PM')).toBeNull();
  });
});

describe('tabla.util · números', () => {
  it.each([
    ['483,33', 483.33],
    ['1.234,5', 1234.5],
    ['1.234', 1234],
    ['1.234.567', 1234567],
    ['133.3', 133.3],
    ['1 234,5', 1234.5],
    ['abc', null],
    ['1e999', null],
  ])('%s → %s', (texto, esperado) => {
    expect(aNumero(texto)).toBe(esperado);
  });
});
