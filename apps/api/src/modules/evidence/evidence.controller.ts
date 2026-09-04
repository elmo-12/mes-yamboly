import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { TIPOS_FUENTE_EXTERNA } from '@mes/types';
import type {
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaResumen,
  EvidenciaTCI,
  EvidenciaTRI,
  EvidenciaTSP,
  FuenteExternaResumen,
  ImportacionResultado,
  ImportacionResumen,
  ListadoTCI,
  RegistroTRI,
  ResumenTCI,
  TipoFuenteExterna,
} from '@mes/types';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators';
import { NoEncontradoException, ValidationException } from '../../common/exceptions';
import { OPCIONES_SUBIDA_TABLA, type ArchivoSubido } from '../../common/utils';
import { EvidenceService } from './evidence.service';
import { EvidenceExportService } from './evidence-export.service';
import { EvidenceImportService } from './evidence-import.service';
import { EvidenceValidationService } from './evidence-validation.service';
import {
  CargarPretestDto,
  CrearInvitacionDto,
  ExportEvidenciaDto,
  ImportarFuenteDto,
  OverrideTciDto,
  TciQueryDto,
  ValidarTciDto,
  VerificacionCfsDto,
} from './dto/evidence.dto';

@ApiTags('evidence')
@Controller('evidencia')
export class EvidenceController {
  constructor(
    private readonly evidencia: EvidenceService,
    private readonly validacion: EvidenceValidationService,
    private readonly fuentes: EvidenceImportService,
    private readonly exportador: EvidenceExportService,
  ) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Los 5 KPI de la tesis con meta, estado y periodos pretest/postest (09.A)' })
  resumen(): Promise<EvidenciaResumen> {
    return this.evidencia.resumen();
  }

  /* ---------------------------------------------------------------- */
  /* Anexo 02 · TRI                                                    */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Fuentes externas (sensores · solicitudes · SAP)                   */
  /* ---------------------------------------------------------------- */

  @Get('fuentes')
  @ApiOperation({ summary: 'Estado de las 3 fuentes externas: filas, última importación y periodo' })
  listarFuentes(): Promise<FuenteExternaResumen[]> {
    return this.fuentes.fuentes();
  }

  @Get('fuentes/:tipo/plantilla')
  @ApiParam({ name: 'tipo', enum: TIPOS_FUENTE_EXTERNA })
  @ApiOkResponse({ description: 'XLSX con la cabecera, 3 filas de ejemplo y una hoja de instrucciones' })
  @ApiOperation({ summary: 'Descarga la plantilla de importación de una fuente' })
  async plantilla(
    @Param('tipo') tipo: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const fuente = this.tipoFuente(tipo);
    const buffer = await this.fuentes.plantilla(fuente);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="plantilla-${fuente.replace('_', '-')}.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  @Post('fuentes/:tipo/importar')
  @HttpCode(201)
  @Roles('jefe', 'investigador')
  @UseInterceptors(FileInterceptor('archivo', OPCIONES_SUBIDA_TABLA))
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'tipo', enum: TIPOS_FUENTE_EXTERNA })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        archivo: { type: 'string', format: 'binary' },
        mapeo: { type: 'string', example: '{"fecha_hora":"Timestamp"}' },
      },
      required: ['archivo'],
    },
  })
  @ApiOperation({ summary: 'Importa un XLSX/CSV (≤ 5 MB) acumulando filas y descartando duplicados' })
  importar(
    @Param('tipo') tipo: string,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @Body() dto: ImportarFuenteDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<ImportacionResultado> {
    const fuente = this.tipoFuente(tipo);
    if (!archivo) {
      throw new ValidationException({ archivo: 'Adjunta el archivo a importar' }, 'Falta el archivo');
    }
    return this.fuentes.importar(
      fuente,
      archivo,
      this.mapeo(dto.mapeo),
      user?.nombre ?? 'Investigador Tesis',
    );
  }

  @Get('fuentes/:tipo/importaciones')
  @ApiParam({ name: 'tipo', enum: TIPOS_FUENTE_EXTERNA })
  @ApiOperation({ summary: 'Historial de importaciones de una fuente' })
  importaciones(@Param('tipo') tipo: string): Promise<ImportacionResumen[]> {
    return this.fuentes.historial(this.tipoFuente(tipo));
  }

  /* ---------------------------------------------------------------- */
  /* Anexo 03 · TCI                                                    */
  /* ---------------------------------------------------------------- */

  @Post('tci/validar')
  @HttpCode(200)
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Valida las capturas del rango contra las fuentes externas y reemplaza el Anexo 03' })
  validarTci(@Body() dto: ValidarTciDto): Promise<EvidenciaTCI> {
    return this.validacion.validar(dto);
  }

  @Get('tci')
  @ApiOperation({ summary: 'Anexo 03 · evaluaciones paginadas con filtros y cabecera del KPI' })
  tci(@Query() query: TciQueryDto): Promise<ListadoTCI> {
    return this.validacion.listar(query);
  }

  @Get('tci/resumen')
  @ApiOperation({ summary: 'Cabecera del TCI: totales, desglose por tipo, última validación y fuentes' })
  resumenTci(): Promise<ResumenTCI> {
    return this.validacion.resumen();
  }

  @Patch('tci/:id')
  @Roles('jefe', 'investigador', 'calidad')
  @ApiOperation({ summary: 'Fuerza criterios de una evaluación y recalcula si el registro es válido' })
  overrideTci(@Param('id') id: string, @Body() dto: OverrideTciDto) {
    return this.validacion.override(id, dto);
  }

  /* ---------------------------------------------------------------- */
  /* Anexo 04 · TSP                                                    */
  /* ---------------------------------------------------------------- */

  @Get('tsp')
  @ApiOperation({ summary: 'Anexo 04 · invitaciones, 8 ítems con promedio y % de acuerdo (PO/PT)' })
  tsp(): Promise<EvidenciaTSP> {
    return this.evidencia.tsp();
  }

  @Post('tsp/invitaciones')
  @HttpCode(201)
  @Roles('jefe', 'investigador')
  @ApiOperation({ summary: 'Crea una invitación con token de un solo uso y devuelve su enlace público' })
  crearInvitacion(@Body() dto: CrearInvitacionDto) {
    return this.evidencia.crearInvitacion(dto);
  }

  /* ---------------------------------------------------------------- */
  /* Anexos 05 y 06 · CFS y EP                                         */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* Utilidades                                                        */
  /* ---------------------------------------------------------------- */

  /** Valida el `:tipo` de la ruta contra las 3 fuentes conocidas. */
  private tipoFuente(tipo: string): TipoFuenteExterna {
    const fuente = TIPOS_FUENTE_EXTERNA.find((t) => t === tipo);
    if (!fuente) throw new NoEncontradoException(`Fuente externa «${tipo}»`);
    return fuente;
  }

  /** `mapeo` llega como texto JSON en el multipart; un JSON inválido es 422. */
  private mapeo(bruto: string | undefined): Record<string, string> {
    if (!bruto || bruto.trim() === '') return {};
    try {
      const parseado: unknown = JSON.parse(bruto);
      if (!parseado || typeof parseado !== 'object' || Array.isArray(parseado)) {
        throw new Error('no es un objeto');
      }
      return Object.fromEntries(
        Object.entries(parseado as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      );
    } catch {
      throw new ValidationException(
        { mapeo: 'Debe ser un JSON `{columnaEsperada: cabeceraDelArchivo}`' },
        'El mapeo de columnas no es válido',
      );
    }
  }
}
