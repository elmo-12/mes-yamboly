import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
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
  RegistroEp,
  VelocidadEstandar,
} from '../../database/entities';
import { AlertsModule } from '../alerts/alerts.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DatasetBuilderService } from './dataset';
import {
  EntrenamientoContinuoService,
  EntrenamientoService,
  EvaluacionService,
  PythonEntrenamientoClient,
  entrenamientoContinuoActivo,
} from './modelado';
import { InferenciaSchedulerService, RiesgoService, inferenciaActiva } from './inferencia';
import { PatronesService } from './patrones';

/**
 * Módulo de analítica: feature store → modelado → evaluación → inferencia.
 *
 * `ScheduleModule.forRoot()` se registra si la inferencia **o** el
 * entrenamiento continuo están activos: sin él los `@Cron` quedan como
 * metadatos inertes, que es justo lo que hace falta en los e2e (nada de
 * temporizadores vivos ni alertas o reentrenamientos no deterministas) y en
 * réplicas donde el cron lo corre otra instancia.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModeloVersion,
      EntrenamientoEjecucion,
      MuestraAnalitica,
      Prediccion,
      IndicadorDiario,
      Alerta,
      RegistroEp,
      OrdenFabricacion,
      Parada,
      Merma,
      CausaParada,
      Linea,
      Producto,
      VelocidadEstandar,
    ]),
    AlertsModule,
    ...(inferenciaActiva() || entrenamientoContinuoActivo() ? [ScheduleModule.forRoot()] : []),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    DatasetBuilderService,
    EvaluacionService,
    EntrenamientoService,
    EntrenamientoContinuoService,
    /*
     * `useFactory`, no la clase a secas: el constructor de
     * `PythonEntrenamientoClient` toma `url`/`token`/`timeoutMs` como
     * parámetros con valor por defecto (`= process.env...`), igual que
     * `PythonHttpPredictionProvider` — no son tokens de DI. Registrarla como
     * provider ordinario hace que Nest intente resolverlos como
     * dependencias (`string`/`number` no son tokens válidos) y revienta el
     * arranque con "Nest can't resolve dependencies".
     */
    { provide: PythonEntrenamientoClient, useFactory: () => new PythonEntrenamientoClient() },
    PatronesService,
    RiesgoService,
    InferenciaSchedulerService,
  ],
  exports: [AnalyticsService, DatasetBuilderService, EntrenamientoService, PatronesService],
})
export class AnalyticsModule {}
