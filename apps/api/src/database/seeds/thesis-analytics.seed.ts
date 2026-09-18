import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { crearPipelineAnalitica } from '../../modules/analytics/pipeline.factory';
import { ModeloVersion, OrdenFabricacion, Parada } from '../entities';
import type { Seeder } from './seeder.interface';

/** Corpus mínimo para que entrenar algo tenga sentido (plan de IA §8.1). */
const MIN_ORDENES = 30;
const MIN_PARADAS = 50;

/**
 * Analítica (spec 08). Este seeder **ya no inventa** un modelo v3.2 con 2 140
 * eventos ni 24 predicciones con `rng(707)`: arranca el orquestador real
 * (`EntrenamientoContinuoService`, el único camino de producción — Python es
 * el único motor de modelado, F5) sobre las órdenes, paradas y mermas que
 * haya en la base.
 *
 * No siembra ningún modelo, a propósito, en dos casos:
 *  - Sin corpus suficiente: cero filas en `modelo_version` y `prediccion`
 *    hacen que `/analitica` caiga en el estado «datos insuficientes», que es
 *    el diseño 08.E y una descripción honesta de la situación — mucho mejor
 *    que una maqueta que parece un modelo entrenado.
 *  - Sin `services/prediccion-py` disponible: el orquestador no tiene con qué
 *    entrenar (Python es el único motor) y se niega a inventar un modelo,
 *    exactamente igual que cuando no hay corpus. Se registra con un log claro
 *    para que quede evidencia de por qué el arranque no dejó un modelo vigente.
 */
export class ThesisAnalyticsSeeder implements Seeder {
  readonly name = 'analítica (bootstrap del pipeline IA)';
  private readonly logger = new Logger('ThesisAnalyticsSeeder');

  async run(dataSource: DataSource): Promise<void> {
    if (await dataSource.getRepository(ModeloVersion).count()) return;

    const ordenes = await dataSource.getRepository(OrdenFabricacion).count();
    const paradas = await dataSource.getRepository(Parada).count();
    if (ordenes < MIN_ORDENES || paradas < MIN_PARADAS) {
      this.logger.warn(
        `Sin corpus suficiente (${ordenes} órdenes, ${paradas} paradas): no se siembra ningún modelo`,
      );
      return;
    }

    const { entrenamientoContinuo } = crearPipelineAnalitica(dataSource);
    const ejecucion = await entrenamientoContinuo.ejecutar('arranque');

    if (ejecucion.estado === 'omitido') {
      this.logger.warn(
        `No se pudo entrenar en el arranque: ${ejecucion.motivo ?? ejecucion.error ?? 'servicio de predicción no disponible'} ` +
          '— no se siembra ningún modelo, la UI caerá en «datos insuficientes» hasta el primer reentrenamiento manual',
      );
      return;
    }

    if (ejecucion.estado === 'error') {
      this.logger.warn(`No se pudo entrenar en el arranque: ${ejecucion.motivo ?? ejecucion.error ?? 'sin más detalle'}`);
      return;
    }

    this.logger.log(
      `${ejecucion.version} · ${ejecucion.muestras} muestras · decisión: ${ejecucion.decision ?? 'sin decisión'} · ${ejecucion.motivo ?? ''}`,
    );
  }
}
