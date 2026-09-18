import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alerta, ModeloVersion, RegistroEp, Umbrales } from '../../database/entities';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsEngineService } from './alerts-engine.service';
import { AlertsLookupService } from './alerts-lookup.service';
import {
  PREDICTION_PROVIDER,
  PrediccionCascadaProvider,
  PythonHttpPredictionProvider,
  RuleBasedPredictionProvider,
} from './prediction';

/**
 * El proveedor de predicciones se resuelve por el token `PREDICTION_PROVIDER`
 * con la cascada de dos niveles (F0: Python es el único motor de modelado
 * entrenado, se retiró el modelo local en TypeScript): servicio Python (sólo
 * si `PREDICTION_SERVICE_URL` está definida) → reglas deterministas. Los dos
 * detrás de la misma interfaz, de modo que el motor de alertas no distingue
 * cuál respondió.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Alerta, Umbrales, RegistroEp, ModeloVersion])],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    AlertsEngineService,
    AlertsLookupService,
    RuleBasedPredictionProvider,
    {
      provide: PREDICTION_PROVIDER,
      inject: [RuleBasedPredictionProvider],
      useFactory: (reglas: RuleBasedPredictionProvider) =>
        new PrediccionCascadaProvider(
          process.env.PREDICTION_SERVICE_URL ? new PythonHttpPredictionProvider(reglas) : null,
          reglas,
        ),
    },
  ],
  exports: [AlertsService, AlertsEngineService, AlertsLookupService, PREDICTION_PROVIDER],
})
export class AlertsModule {}
