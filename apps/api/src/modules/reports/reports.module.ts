import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Alerta,
  CausaMerma,
  CausaParada,
  EvaluacionCalidad,
  ExportJob,
  IndicadorDiario,
  IndicadorKpi,
  IndicadorLinea,
  IndicadorTurno,
  Linea,
  Merma,
  MermaAgregada,
  MermaCausa,
  OrdenFabricacion,
  Parada,
  ParadaAgregada,
  ParadaCategoria,
  Producto,
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
      Linea,
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
      CausaParada,
      CausaMerma,
      Producto,
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService],
  exports: [ReportsService],
})
export class ReportsModule {}
