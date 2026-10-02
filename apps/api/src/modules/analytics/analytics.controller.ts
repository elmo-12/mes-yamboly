import { Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type {
  AnaliticaResumen,
  EstadoDatos,
  Modelo,
  Patrones,
  Predicciones,
  ReentrenamientoJob,
} from '@mes/types';
import { ROLES_GESTIONAR_MODELO, ROLES_VER_ANALITICA } from '@mes/types';
import { Roles } from '../../common/decorators';
import { AnalyticsService } from './analytics.service';

/**
 * Analítica IA. Por defecto solo la ven jefe, supervisor e investigador (lo
 * mismo que muestra la web); las acciones sobre el modelo se restringen más en
 * cada handler. Matriz completa en `@mes/types/permisos-alertas-analitica`.
 */
@ApiTags('analytics')
@Roles(...ROLES_VER_ANALITICA)
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
    description:
      'Fuerza la variante mostrada (solo demo/QA: se ignora con NODE_ENV=production); sin él se devuelve el estado calculado',
  })
  estadoDatos(@Query('estado') estado?: string): Promise<EstadoDatos> {
    const forzable = process.env.NODE_ENV !== 'production';
    return this.analitica.estadoDatos(
      forzable && (estado === 'suficiente' || estado === 'insuficiente') ? estado : undefined,
    );
  }

  @Post('reentrenar')
  @HttpCode(202)
  @Roles(...ROLES_GESTIONAR_MODELO)
  @ApiOperation({ summary: 'Encola un reentrenamiento — sólo jefe e investigador' })
  reentrenar(): Promise<ReentrenamientoJob> {
    return this.analitica.reentrenar('manual');
  }

  @Post('reentrenar/continuo')
  @HttpCode(202)
  @Roles('jefe', 'investigador')
  @ApiOperation({
    summary:
      'Encola un reentrenamiento contra el orquestador continuo (Python) — sólo jefe e investigador. ' +
      'Mismo contrato ReentrenamientoJob que /reentrenar: el mensaje final indica si la versión candidata quedó vigente o no.',
  })
  reentrenarContinuo(): Promise<ReentrenamientoJob> {
    return this.analitica.reentrenarContinuo();
  }

  @Get('modelo/diagnostico')
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Matriz de confusión, corte temporal y perfil del corpus' })
  diagnostico(): Promise<Record<string, unknown>> {
    return this.analitica.diagnostico();
  }

  @Get('dataset/exportar')
  @Roles('investigador')
  @Header('content-type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV del feature store (una fila por línea × fecha × turno × modo)' })
  exportarDataset(): Promise<string> {
    return this.analitica.exportarDataset();
  }

  @Post('predicciones/recalcular')
  @HttpCode(HttpStatus.OK)
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Fuerza un ciclo de inferencia sin esperar al cron de 15 min' })
  recalcular(): Promise<{ predicciones: number; alertas: number; vencidas: number; proveedor: string }> {
    return this.analitica.recalcular();
  }

  @Post('modelo/:version/activar')
  @HttpCode(HttpStatus.OK)
  @Roles(...ROLES_GESTIONAR_MODELO)
  @ApiOperation({ summary: 'Marca una versión como vigente y archiva la anterior' })
  activar(@Param('version') version: string): Promise<Modelo> {
    return this.analitica.activar(version);
  }
}
