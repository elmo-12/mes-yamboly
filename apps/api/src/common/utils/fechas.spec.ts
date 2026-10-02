import { sumarDiasLocal } from './fechas';
import { RiesgoService } from '../../modules/analytics/inferencia/riesgo.service';

/* Deben pasar igual con `TZ=UTC` (despliegue) y `TZ=America/Lima`. */
describe(`fechas de planta independientes de la TZ del proceso (TZ=${process.env.TZ ?? 'local'})`, () => {
  it('sumarDiasLocal suma días de calendario a fechas e ISO locales', () => {
    expect(sumarDiasLocal('2026-10-02', -6)).toBe('2026-09-26');
    expect(sumarDiasLocal('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDiasLocal('2026-10-02T23:30:00', -30)).toBe('2026-09-02T23:30:00');
    expect(sumarDiasLocal('2026-10-02T06:00', 1)).toBe('2026-10-03T06:00');
  });

  it('turnoObjetivo usa la hora de Lima, no la del proceso', () => {
    const turnoObjetivo = RiesgoService.prototype.turnoObjetivo;
    /* 13:00 en Lima (18:00 UTC): corre el Día, el objetivo es la Noche de hoy. */
    expect(turnoObjetivo(new Date('2026-10-02T18:00:00Z'))).toMatchObject({ fecha: '2026-10-02', turno: 'N' });
    /* 19:00 en Lima (00:00 UTC del día 3): el objetivo es el Día de mañana. */
    expect(turnoObjetivo(new Date('2026-10-03T00:00:00Z'))).toMatchObject({ fecha: '2026-10-03', turno: 'D' });
    /* 02:00 en Lima: corre la Noche del día anterior; el Día objetivo es el de hoy. */
    expect(turnoObjetivo(new Date('2026-10-02T07:00:00Z'))).toMatchObject({ fecha: '2026-10-02', turno: 'D' });
  });
});
