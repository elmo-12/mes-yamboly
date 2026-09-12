import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alerta, ModeloVersion, RegistroEp, Umbrales } from '../../database/entities';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsEngineService } from './alerts-engine.service';
import { AlertsLookupService } from './alerts-lookup.service';
import {
  ModeloLocalPredictionProvider,
  PREDICTION_PROVIDER,
  PrediccionCascadaProvider,
  PythonHttpPredictionProvider,
  RuleBasedPredictionProvider,
} from './prediction';

/**
 * El proveedor de predicciones se resuelve por el token `PREDICTION_PROVIDER`
 * con la cascada de tres niveles: servicio Python (sólo si
 * `PREDICTION_SERVICE_URL` está definida) → modelo local entrenado (si hay una
 * `modelo_version` vigente con pesos) → reglas deterministas. Los tres detrás
 * de la misma interfaz, de modo que el motor de alertas no distingue cuál
 * respondió.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Alerta, Umbrales, RegistroEp, ModeloVersion])],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    AlertsEngineService,
    AlertsLookupService,
    RuleBasedPredictionProvider,
    ModeloLocalPredictionProvider,
    {
      provide: PREDICTION_PROVIDER,
      inject: [RuleBasedPredictionProvider, ModeloLocalPredictionProvider],
      useFactory: (reglas: RuleBasedPredictionProvider, local: ModeloLocalPredictionProvider) =>
        new PrediccionCascadaProvider(
          process.env.PREDICTION_SERVICE_URL ? new PythonHttpPredictionProvider(reglas) : null,
          local,
          reglas,
        ),
    },
  ],
  exports: [
    AlertsService,
    AlertsEngineService,
    AlertsLookupService,
    ModeloLocalPredictionProvider,
    PREDICTION_PROVIDER,
  ],
})
export class AlertsModule {}
