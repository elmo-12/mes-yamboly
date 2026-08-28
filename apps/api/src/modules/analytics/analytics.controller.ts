import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type {
  AnaliticaResumen,
  EstadoDatos,
  Modelo,
  Patrones,
  Predicciones,
  ReentrenamientoJob,
} from '@mes/types';
import { Roles } from '../../common/decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('analitica')
export class AnalyticsController {
  constructor(private readonly analitica: AnalyticsService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Modelo activo, KPI, insights, riesgo por línea y predicciones activas (08.A)' })
  resumen(): Promise<AnaliticaResumen> {
    return this.analitica.resumen();
  }

  @Get('patrones')
  @ApiOperation({ summary: 'Heatmap causa × turno en minutos y patrones recurrentes (08.B)' })
  patrones(): Promise<Patrones> {
    return this.analitica.patrones();
  }

  @Get('predicciones')
  @ApiOperation({ summary: 'Serie predicho vs real de 30 días e histórico con acierto (08.C)' })
  predicciones(): Promise<Predicciones> {
    return this.analitica.prediccionesSerie();
  }

  @Get('modelo')
  @ApiOperation({ summary: 'Fases CRISP-DM, métricas, versiones y variables de entrada (08.D)' })
  modelo(): Promise<Modelo> {
    return this.analitica.modelo();
  }

  @Get('estado-datos')
  @ApiOkResponse({ description: 'Avance del volumen mínimo de eventos para reentrenar (08.E)' })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['suficiente', 'insuficiente'],
    description: 'Fuerza la variante mostrada (demo/QA); sin él se devuelve el estado calculado',
  })
  estadoDatos(@Query('estado') estado?: string): Promise<EstadoDatos> {
    return this.analitica.estadoDatos(
      estado === 'suficiente' || estado === 'insuficiente' ? estado : undefined,
    );
  }

  @Post('reentrenar')
  @HttpCode(202)
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Encola un reentrenamiento — sólo jefe e investigador' })
  reentrenar(): Promise<ReentrenamientoJob> {
    return this.analitica.reentrenar();
  }

  @Post('modelo/:version/activar')
  @HttpCode(HttpStatus.OK)
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Marca una versión como vigente y archiva la anterior' })
  activar(@Param('version') version: string): Promise<Modelo> {
    return this.analitica.activar(version);
  }
}
