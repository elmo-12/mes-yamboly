/**
 * Generación de ids legibles sin carrera.
 *
 * Antes cada servicio hacía `count() + 1` y `save()`: dos altas simultáneas
 * calculaban el mismo número (500 por clave duplicada) y, peor, `save()` con un
 * id ya existente hace UPDATE y pisa otro registro. Aquí se conserva el formato
 * (`PAR-<orden>-N<n>`) pero se inserta con `INSERT` puro y, si la clave ya
 * existe, se reintenta con el siguiente número (más un salto aleatorio para
 * que los reintentos concurrentes no vuelvan a chocar).
 */
import type { ObjectLiteral, Repository } from 'typeorm';

const MAX_INTENTOS = 25;

/** `true` si el error es una violación de clave única (Postgres o SQLite). */
export function esClaveDuplicada(error: unknown): boolean {
  const e = error as { code?: string; driverError?: { code?: string }; message?: string };
  const codigo = e?.code ?? e?.driverError?.code;
  if (codigo === '23505' || codigo === 'SQLITE_CONSTRAINT' || codigo === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return true;
  }
  return /duplicate key|UNIQUE constraint failed/i.test(e?.message ?? '');
}

/**
 * INSERT sobre una **copia** superficial de la entidad. En Postgres TypeORM
 * deja las columnas `simple-json` ya serializadas (string) en el objeto que se
 * le pasa; insertando una copia, el original conserva arrays y objetos.
 */
export async function insertarCopia<T extends ObjectLiteral>(repo: Repository<T>, entidad: T): Promise<void> {
  await repo.insert({ ...entidad } as never);
}

/**
 * Inserta `entidad` asignándole un id `construirId(n)` libre. `n` arranca en
 * `count() + 1` (mismo formato que antes) y avanza ante colisión.
 */
export async function insertarConIdSecuencial<T extends ObjectLiteral & { id: string }>(
  repo: Repository<T>,
  entidad: T,
  construirId: (n: number) => string,
): Promise<T> {
  let n = (await repo.count()) + 1;
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    entidad.id = construirId(n);
    try {
      await insertarCopia(repo, entidad);
      return entidad;
    } catch (error) {
      if (!esClaveDuplicada(error)) throw error;
      n += 1 + Math.floor(Math.random() * 3);
    }
  }
  /* Último recurso: sufijo aleatorio, mismo prefijo. */
  entidad.id = construirId(n + Math.floor(Math.random() * 1_000_000));
  await insertarCopia(repo, entidad);
  return entidad;
}
