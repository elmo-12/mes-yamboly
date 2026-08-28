import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  EncuestaTSP,
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaResumen,
  EvidenciaTCI,
  EvidenciaTRI,
  RegistroTRI,
} from '@mes/types';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators';
import { EvidenceService } from './evidence.service';
import { EvidenceExportService } from './evidence-export.service';
import {
  CargarPretestDto,
  ExportEvidenciaDto,
  OverrideTciDto,
  VerificacionCfsDto,
} from './dto/evidence.dto';

@ApiTags('evidence')
@Controller('evidencia')
export class EvidenceController {
  constructor(
    private readonly evidencia: EvidenceService,
    private readonly exportador: EvidenceExportService,
  ) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Los 5 KPI de la tesis con meta, estado y periodos pretest/postest (09.A)' })
  resumen(): Promise<EvidenciaResumen> {
    return this.evidencia.resumen();
  }

  @Get('tri')
  @ApiOperation({ summary: 'Anexo 02 · postest automático, pretest cargado y % de reducción' })
  tri(): Promise<EvidenciaTRI> {
    return this.evidencia.tri();
  }

  @Post('tri/pretest')
  @HttpCode(201)
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Carga la hoja del pretest medida a mano' })
  cargarPretest(@Body() dto: CargarPretestDto): Promise<{ data: RegistroTRI[]; promedioPretest: number }> {
    return this.evidencia.cargarPretest(dto);
  }

  @Get('tci')
  @ApiOperation({ summary: 'Anexo 03 · completo, preciso, trazable y válido por registro' })
  tci(): Promise<EvidenciaTCI> {
    return this.evidencia.tci();
  }

  @Patch('tci/:id')
  @Roles('jefe', 'investigador', 'calidad')
  @ApiOperation({ summary: 'Sobrescribe manualmente los criterios de una evaluación' })
  overrideTci(@Param('id') id: string, @Body() dto: OverrideTciDto) {
    return this.evidencia.overrideTci(id, dto);
  }

  @Get('tsp')
  @ApiOperation({ summary: 'Anexo 04 · 8 ítems con promedio y % de acuerdo (PO/PT)' })
  tsp(): Promise<EncuestaTSP> {
    return this.evidencia.tsp();
  }

  @Get('cfs')
  @ApiOperation({ summary: 'Anexo 05 · lista de cotejo de las 9 funcionalidades' })
  cfs(): Promise<EvidenciaCFS> {
    return this.evidencia.cfs();
  }

  @Patch('cfs/:id')
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Marca una funcionalidad como verificada' })
  actualizarCfs(@Param('id') id: string, @Body() dto: VerificacionCfsDto) {
    return this.evidencia.actualizarCfs(id, dto);
  }

  @Get('ep')
  @ApiOperation({ summary: 'Anexo 06 · predicciones confirmadas y su acierto' })
  ep(): Promise<EvidenciaEP> {
    return this.evidencia.ep();
  }

  @Post('exportar')
  @HttpCode(202)
  @ApiOkResponse({ description: 'XLSX con una hoja por anexo (02–06)' })
  exportar(
    @Body() dto: ExportEvidenciaDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<{ id: string; estado: 'generando' }> {
    return this.exportador.exportar(dto, user?.nombre ?? 'Investigador Tesis');
  }
}
