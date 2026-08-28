import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Alerta,
  IndicadorDiario,
  ModeloVersion,
  ParadaAgregada,
  Prediccion,
  RegistroEp,
  RegistroTiempo,
} from '../../database/entities';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModeloVersion,
      Prediccion,
      IndicadorDiario,
      ParadaAgregada,
      Alerta,
      RegistroEp,
      RegistroTiempo,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
