import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
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
  RegistroEp,
  VelocidadEstandar,
} from '../../database/entities';
import { AlertsModule } from '../alerts/alerts.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { DatasetBuilderService } from './dataset';
import { EntrenamientoService, EvaluacionService } from './modelado';
import { InferenciaSchedulerService, RiesgoService, inferenciaActiva } from './inferencia';
import { PatronesService } from './patrones';

/**
 * Módulo de analítica: feature store → modelado → evaluación → inferencia.
 *
 * `ScheduleModule.forRoot()` se registra **sólo** cuando la inferencia está
 * activa: sin él los `@Cron` quedan como metadatos inertes, que es justo lo que
 * hace falta en los e2e (nada de temporizadores vivos ni alertas no
 * deterministas) y en réplicas donde el cron lo corre otra instancia.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModeloVersion,
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
    ...(inferenciaActiva() ? [ScheduleModule.forRoot()] : []),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    DatasetBuilderService,
    EvaluacionService,
    EntrenamientoService,
    PatronesService,
    RiesgoService,
    InferenciaSchedulerService,
  ],
  exports: [AnalyticsService, DatasetBuilderService, EntrenamientoService, PatronesService],
})
export class AnalyticsModule {}
