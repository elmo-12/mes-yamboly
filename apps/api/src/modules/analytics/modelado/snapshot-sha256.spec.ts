import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calcularSnapshotSha256 } from './entrenamiento-continuo.service';
import type { MuestraEntrenamientoPy } from './python-entrenamiento.client';

/**
 * Vector dorado de canonicalización (`docs/prediccion-python.md` §3.1).
 *
 * El mismo fichero lo asserta `services/prediccion-py/tests/test_snapshot_sha256.py`.
 * Si alguien cambia la canonicalización de un lado, este test (o el de pytest)
 * falla **antes** de que el desajuste aparezca en producción como un 422 que
 * rechaza todos los entrenamientos.
 */
const VECTOR = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../../../contracts/snapshot-vector-dorado.json'), 'utf-8'),
) as { sha256Esperado: string; muestras: MuestraEntrenamientoPy[] };

describe('calcularSnapshotSha256', () => {
  it('reproduce el vector dorado compartido con el servicio Python', () => {
    expect(calcularSnapshotSha256(VECTOR.muestras)).toBe(VECTOR.sha256Esperado);
  });

  it('es estable frente al orden de las claves, que se canonicaliza', () => {
    const reordenada = VECTOR.muestras.map(
      (m) => Object.fromEntries(Object.entries(m).reverse()) as unknown as MuestraEntrenamientoPy,
    );
    expect(calcularSnapshotSha256(reordenada)).toBe(VECTOR.sha256Esperado);
  });

  it('depende del orden de las filas: se hashea el array tal como viaja', () => {
    /* No es un capricho: si un lado reordenase las filas y enviase otro orden,
     * el hash nunca cuadraría. El contrato fija «en su mismo orden». */
    expect(calcularSnapshotSha256([...VECTOR.muestras].reverse())).not.toBe(VECTOR.sha256Esperado);
  });

  it('cambia si cambia un solo valor', () => {
    const tocada = structuredClone(VECTOR.muestras);
    tocada[0]!.features.mermaKg7d = 12.6;
    expect(calcularSnapshotSha256(tocada)).not.toBe(VECTOR.sha256Esperado);
  });
});
