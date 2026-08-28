import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alerta, RegistroEp, Umbrales } from '../../database/entities';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsEngineService } from './alerts-engine.service';
import { AlertsLookupService } from './alerts-lookup.service';
import {
  PREDICTION_PROVIDER,
  PythonHttpPredictionProvider,
  RuleBasedPredictionProvider,
} from './prediction';

/**
 * El proveedor de predicciones se resuelve por el token `PREDICTION_PROVIDER`:
 * con `PREDICTION_SERVICE_URL` definido se usa el servicio Python (con
 * repliegue a reglas); sin ella, sólo el proveedor determinista de reglas.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Alerta, Umbrales, RegistroEp])],
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
        process.env.PREDICTION_SERVICE_URL ? new PythonHttpPredictionProvider(reglas) : reglas,
    },
  ],
  exports: [AlertsService, AlertsEngineService, AlertsLookupService, PREDICTION_PROVIDER],
})
export class AlertsModule {}
