import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EncuestaRespuesta,
  EncuestaSesion,
  EvaluacionCalidad,
  ExportJob,
  ImportacionFuente,
  LecturaSensor,
  Merma,
  OrdenFabricacion,
  Parada,
  RegistroEp,
  RegistroTiempo,
  RegistroVelocidad,
  SolicitudExterna,
  TransferenciaSap,
  Umbrales,
  User,
  VerificacionFuncional,
} from '../../database/entities';
import { EvidenceController } from './evidence.controller';
import { SurveyController } from './survey.controller';
import { EvidenceService } from './evidence.service';
import { EvidenceImportService } from './evidence-import.service';
import { EvidenceValidationService } from './evidence-validation.service';
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
      /* Directorio de usuarios: resuelve el invitado/rol de una invitación TSP. */
      User,
      /* Registros operativos que evalúa el motor de calidad (TCI). */
      Parada,
      Merma,
      RegistroVelocidad,
      OrdenFabricacion,
      Umbrales,
      /* Fuentes externas importadas. */
      ImportacionFuente,
      LecturaSensor,
      SolicitudExterna,
      TransferenciaSap,
    ]),
  ],
  controllers: [EvidenceController, SurveyController],
  providers: [
    EvidenceService,
    EvidenceImportService,
    EvidenceValidationService,
    EvidenceSurveyService,
    EvidenceExportService,
    EvidenceTriListener,
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}
