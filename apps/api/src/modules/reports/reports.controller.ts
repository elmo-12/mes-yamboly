import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { ExportJob, IndicadoresResumen, MermasResumen, ParadasResumen } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';
import { ReporteQueryDto } from './dto/reporte-query.dto';
import { ExportRequestDto } from './dto/export-request.dto';

@ApiTags('reports')
@Controller('reportes')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ReportsExportService,
  ) {}

  @Get('indicadores')
  @ApiOperation({ summary: 'KPI, tendencia de OEE, OEE por línea y comparativa por turno (06.A)' })
  indicadores(@Query() query: ReporteQueryDto): Promise<IndicadoresResumen> {
    return this.reports.indicadores(query);
  }

  @Get('paradas')
  @ApiOperation({ summary: 'KPI, Pareto, donut por categoría y detalle por causa (06.B)' })
  paradas(@Query() query: ReporteQueryDto): Promise<ParadasResumen> {
    return this.reports.paradasResumen(query);
  }

  @Get('mermas')
  @ApiOperation({ summary: 'KPI, apiladas por línea, heatmap causa × turno y tabla (06.C)' })
  mermas(@Query() query: ReporteQueryDto): Promise<MermasResumen> {
    return this.reports.mermasResumen(query);
  }

  @Post('exportar')
  @HttpCode(202)
  @ApiOperation({ summary: 'Encola una exportación XLSX (06.D)' })
  exportar(@Body() dto: ExportRequestDto, @CurrentUser() user?: AuthUser): Promise<ExportJob> {
    return this.exports.crear(dto, user?.nombre ?? 'Sistema');
  }

  @Get('exportaciones')
  @ApiOkResponse({ description: 'Historial de exportaciones, más recientes primero' })
  async exportaciones(): Promise<{ data: ExportJob[] }> {
    return { data: await this.exports.historial() };
  }

  @Get('exportaciones/:id/descargar')
  @ApiOperation({ summary: 'Descarga el archivo generado' })
  async descargar(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, nombre, tipo } = await this.exports.descargar(id);
    res.set({
      'Content-Type': tipo,
      'Content-Disposition': `attachment; filename="${nombre}"`,
    });
    /* `StreamableFile` es lo que Nest sabe volcar al socket; devolver el
       `ReadStream` a secas lo serializaría como JSON. */
    return new StreamableFile(stream);
  }
}
