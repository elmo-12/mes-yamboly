import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Linea, OrdenFabricacion, Producto, User } from '../../src/database/entities';

/**
 * Siembra un corpus adicional de órdenes, sólo para que
 * `DatasetBuilderService` calcule **muestras `anticipado` de sobra**
 * (`EntrenamientoContinuoService` exige `MIN_MUESTRAS = 200`; el corpus base
 * de `apps/api/src/database/seeds/data/orders.ts` sólo produce ~60).
 *
 * Se sitúa muy por delante de cualquier otra ventana sembrada (2026-01-01 en
 * adelante, antes del corpus base de agosto) para no fusionarse con esos
 * grupos línea×fecha×turno.
 *
 * Con el entrenador stub de este spec las métricas del walk-forward las fija
 * el propio stub (no dependen de una señal real en los datos), así que estas
 * órdenes no necesitan paradas ni mermas: sólo cuentan como grupos
 * línea×fecha×turno para superar el guardarraíl de volumen.
 */
export async function sembrarCorpusEntrenable(
  app: INestApplication,
  dias: number,
): Promise<{ muestrasNuevas: number }> {
  const ds = app.get(DataSource);
  const linea = await ds.getRepository(Linea).findOneOrFail({ where: {}, order: { id: 'ASC' } });
  const producto = await ds.getRepository(Producto).findOneOrFail({ where: {}, order: { id: 'ASC' } });
  const usuario = await ds.getRepository(User).findOneOrFail({ where: {}, order: { id: 'ASC' } });

  const repoOrden = ds.getRepository(OrdenFabricacion);
  const ordenes: OrdenFabricacion[] = [];
  const primerDia = new Date('2026-01-01T00:00:00');

  for (let i = 0; i < dias; i += 1) {
    const d = new Date(primerDia);
    d.setDate(d.getDate() + i);
    const p = (n: number) => String(n).padStart(2, '0');
    const fecha = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

    for (const turno of ['D', 'N'] as const) {
      const id = `OF-VOL-${String(i).padStart(3, '0')}-${turno}`;
      ordenes.push(
        repoOrden.create({
          id,
          codigo: id,
          fecha,
          lineaId: linea.id,
          productoId: producto.id,
          turno,
          lote: `L-VOL-${i}-${turno}`,
          vencimiento: `${d.getFullYear() + 1}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
          planificado: 20_000,
          producido: 18_000,
          conteoCodificadora: 18_000,
          velocidadEstandar: 50,
          velocidadEstandarId: null,
          estado: 'cerrada',
          maquinistaId: usuario.id,
          supervisorId: usuario.id,
          operarios: 2,
          colaboradores: [],
          oee: { oee: 80, disponibilidad: 90, desempeno: 95, calidad: 98 },
          paradasCount: 0,
          mermasKg: 0,
          inicio: `${fecha}T${turno === 'D' ? '06' : '18'}:00:00`,
          fin: turno === 'D' ? `${fecha}T18:00:00` : `${fecha}T23:59:59`,
        }),
      );
    }
  }

  await repoOrden.save(ordenes, { chunk: 100 });
  return { muestrasNuevas: ordenes.length };
}
