import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { crearPipelineAnalitica } from '../../modules/analytics/pipeline.factory';
import { DatosInsuficientesError } from '../../modules/analytics/modelado';
import { ModeloVersion, OrdenFabricacion, Parada } from '../entities';
import type { Seeder } from './seeder.interface';

/** Corpus mínimo para que entrenar algo tenga sentido (plan de IA §8.1). */
const MIN_ORDENES = 30;
const MIN_PARADAS = 50;

/** Primera versión entrenada con datos reales; la maqueta numeraba en v3.2. */
const VERSION_INICIAL = 'v1.0';

/**
 * Analítica (spec 08). Este seeder **ya no inventa** un modelo v3.2 con 2 140
 * eventos ni 24 predicciones con `rng(707)`: arranca el pipeline real sobre las
 * órdenes, paradas y mermas que haya en la base.
 *
 * Si no hay corpus suficiente no siembra nada, a propósito: cero filas en
 * `modelo_version` y `prediccion` hacen que `/analitica` caiga en el estado
 * «datos insuficientes», que es el diseño 08.E y una descripción honesta de la
 * situación — mucho mejor que una maqueta que parece un modelo entrenado.
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

    const { entrenamiento } = crearPipelineAnalitica(dataSource);
    try {
      const resultado = await entrenamiento.entrenar(VERSION_INICIAL);
      this.logger.log(
        `${resultado.version} · ${resultado.muestras} muestras · ${resultado.features} features · ` +
          `AUC ${resultado.auc} · F1 ${resultado.f1} · lift@3 ${resultado.liftTop3}`,
      );
    } catch (error: unknown) {
      if (error instanceof DatosInsuficientesError) {
        this.logger.warn(`No se pudo entrenar: ${error.message}`);
        await dataSource.getRepository(ModeloVersion).delete({ version: VERSION_INICIAL });
        return;
      }
      throw error;
    }
  }
}
