import type { DataSource } from 'typeorm';
import {
  Alerta,
  CausaParada,
  EntrenamientoEjecucion,
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
import { EntrenamientoContinuoService, EntrenamientoService, EvaluacionService, PythonEntrenamientoClient } from './modelado';

export interface PipelineAnalitica {
  dataset: DatasetBuilderService;
  evaluacion: EvaluacionService;
  entrenamiento: EntrenamientoService;
  entrenamientoContinuo: EntrenamientoContinuoService;
}

/**
 * Arma el pipeline fuera del contenedor de Nest. Los servicios son clases
 * normales con repositorios inyectados, así que el seeder y el script
 * `pnpm --filter @mes/api entrenar` pueden ejecutar exactamente el mismo código
 * que corre dentro de la API — sin duplicar la lógica de entrenamiento en un
 * script aparte, que es como se acaban teniendo dos modelos distintos.
 *
 * `entrenamientoContinuo` es el **único** camino de entrenamiento (Python es el
 * único motor, §F5): `entrenamiento` se conserva sólo por `siguienteVersion()`,
 * `activar()` e `importancias()`, que `EntrenamientoContinuoService` reutiliza.
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
    dataSource,
  );
  const evaluacion = new EvaluacionService(
    dataSource.getRepository(Prediccion),
    dataSource.getRepository(IndicadorDiario),
  );
  const entrenamiento = new EntrenamientoService(
    dataSource.getRepository(ModeloVersion),
    dataSource.getRepository(Alerta),
  );
  /*
   * `useFactory`-equivalente manual: igual que en `AnalyticsModule`, el
   * constructor de `PythonEntrenamientoClient` toma `url`/`token`/`timeoutMs`
   * con valor por defecto (`= process.env...`), así que `new` sin argumentos
   * ya lee `PREDICTION_SERVICE_URL` del entorno del proceso.
   */
  const python = new PythonEntrenamientoClient();
  const entrenamientoContinuo = new EntrenamientoContinuoService(
    dataSource,
    dataset,
    evaluacion,
    entrenamiento,
    python,
    dataSource.getRepository(ModeloVersion),
    dataSource.getRepository(EntrenamientoEjecucion),
    dataSource.getRepository(Alerta),
  );
  return { dataset, evaluacion, entrenamiento, entrenamientoContinuo };
}
