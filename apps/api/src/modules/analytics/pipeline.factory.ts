import type { DataSource } from 'typeorm';
import {
  Alerta,
  CausaParada,
  IndicadorDiario,
  Linea,
  Merma,
  ModeloVersion,
  MuestraAnalitica,
  OrdenFabricacion,
  Parada,
  Prediccion,
  Producto,
  VelocidadEstandar,
} from '../../database/entities';
import { DatasetBuilderService } from './dataset';
import { EntrenamientoService, EvaluacionService } from './modelado';

export interface PipelineAnalitica {
  dataset: DatasetBuilderService;
  evaluacion: EvaluacionService;
  entrenamiento: EntrenamientoService;
}

/**
 * Arma el pipeline fuera del contenedor de Nest. Los servicios son clases
 * normales con repositorios inyectados, así que el seeder y el script
 * `pnpm --filter @mes/api entrenar` pueden ejecutar exactamente el mismo código
 * que corre dentro de la API — sin duplicar la lógica de entrenamiento en un
 * script aparte, que es como se acaban teniendo dos modelos distintos.
 */
export function crearPipelineAnalitica(dataSource: DataSource): PipelineAnalitica {
  const dataset = new DatasetBuilderService(
    dataSource.getRepository(OrdenFabricacion),
    dataSource.getRepository(Parada),
    dataSource.getRepository(Merma),
    dataSource.getRepository(CausaParada),
    dataSource.getRepository(Linea),
    dataSource.getRepository(Producto),
    dataSource.getRepository(VelocidadEstandar),
    dataSource.getRepository(MuestraAnalitica),
  );
  const evaluacion = new EvaluacionService(
    dataSource.getRepository(Prediccion),
    dataSource.getRepository(IndicadorDiario),
  );
  const entrenamiento = new EntrenamientoService(
    dataset,
    evaluacion,
    dataSource.getRepository(ModeloVersion),
    dataSource.getRepository(Alerta),
  );
  return { dataset, evaluacion, entrenamiento };
}
