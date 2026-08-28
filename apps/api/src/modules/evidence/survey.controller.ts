import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { EncuestaPublica } from '@mes/types';
import { Public } from '../../common/decorators';
import { EvidenceSurveyService } from './evidence-survey.service';
import { EncuestaRespuestaDto } from './dto/evidence.dto';

/** Encuesta de satisfacción (Anexo 04): pública, sin token JWT. */
@ApiTags('evidence')
@Controller('encuesta')
export class SurveyController {
  constructor(private readonly encuesta: EvidenceSurveyService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Ficha pública con los 8 ítems del cuestionario' })
  obtener(@Param('token') token: string): Promise<EncuestaPublica> {
    return this.encuesta.obtener(token);
  }

  @Public()
  @Post(':token')
  @HttpCode(201)
  @ApiOperation({ summary: 'Guarda las respuestas y recalcula el TSP · 409 si el token ya se usó' })
  responder(
    @Param('token') token: string,
    @Body() dto: EncuestaRespuestaDto,
  ): Promise<{ recibido: boolean; respuestas: number; pctAcuerdo: number }> {
    return this.encuesta.responder(token, dto);
  }
}
