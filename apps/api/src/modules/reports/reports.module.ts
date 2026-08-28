import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Alerta,
  EvaluacionCalidad,
  ExportJob,
  IndicadorDiario,
  IndicadorKpi,
  IndicadorLinea,
  IndicadorTurno,
  Merma,
  MermaAgregada,
  MermaCausa,
  OrdenFabricacion,
  Parada,
  ParadaAgregada,
  ParadaCategoria,
  RegistroTiempo,
  RegistroVelocidad,
} from '../../database/entities';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IndicadorKpi,
      IndicadorDiario,
      IndicadorLinea,
      IndicadorTurno,
      ParadaAgregada,
      ParadaCategoria,
      MermaAgregada,
      MermaCausa,
      ExportJob,
      OrdenFabricacion,
      Parada,
      Merma,
      RegistroVelocidad,
      Alerta,
      RegistroTiempo,
      EvaluacionCalidad,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService],
  exports: [ReportsService],
})
export class ReportsModule {}
