import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ALERTS_LOOKUP } from '../../common/services/alerts-lookup';
import {
  DeteccionIoT,
  Merma,
  OrdenFabricacion,
  Parada,
  RegistroVelocidad,
} from '../../database/entities';
import { AlertsLookupService } from '../alerts/alerts-lookup.service';
import { AlertsModule } from '../alerts/alerts.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrdenFabricacion, Parada, Merma, RegistroVelocidad, DeteccionIoT]),
    AlertsModule,
  ],
  controllers: [RealtimeController],
  providers: [RealtimeService, { provide: ALERTS_LOOKUP, useExisting: AlertsLookupService }],
  exports: [RealtimeService],
})
export class RealtimeModule {}
