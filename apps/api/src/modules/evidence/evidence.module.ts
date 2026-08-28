import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EncuestaRespuesta,
  EncuestaSesion,
  EvaluacionCalidad,
  ExportJob,
  RegistroEp,
  RegistroTiempo,
  VerificacionFuncional,
} from '../../database/entities';
import { EvidenceController } from './evidence.controller';
import { SurveyController } from './survey.controller';
import { EvidenceService } from './evidence.service';
import { EvidenceSurveyService } from './evidence-survey.service';
import { EvidenceExportService } from './evidence-export.service';
import { EvidenceTriListener } from './evidence-tri.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RegistroTiempo,
      EvaluacionCalidad,
      EncuestaSesion,
      EncuestaRespuesta,
      VerificacionFuncional,
      RegistroEp,
      ExportJob,
    ]),
  ],
  controllers: [EvidenceController, SurveyController],
  providers: [EvidenceService, EvidenceSurveyService, EvidenceExportService, EvidenceTriListener],
  exports: [EvidenceService],
})
export class EvidenceModule {}
