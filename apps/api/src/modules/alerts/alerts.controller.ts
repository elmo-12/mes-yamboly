import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Alerta, AlertasResumen, Paginated, Umbrales } from '@mes/types';
import { CurrentUser, Roles, type AuthUser } from '../../common/decorators';
import { AlertsService, type ResultadoConfirmacion, type ResultadoMutacion } from './alerts.service';
import { AlertaQueryDto } from './dto/alerta-query.dto';
import { AtenderAlertaDto, ConfirmarEventoDto, ConfirmarLoteDto, DescartarAlertaDto } from './dto/mutaciones.dto';
import { UmbralesDto } from './dto/umbrales.dto';

@ApiTags('alerts')
@Controller('alertas')
export class AlertsController {
  constructor(private readonly alertas: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Bandeja de alertas con filtros y paginación (07.A)' })
  listar(@Query() query: AlertaQueryDto): Promise<Paginated<Alerta>> {
    return this.alertas.listar(query);
  }

  @Get('resumen')
  @ApiOkResponse({ description: 'Contadores del header y EP acumulada' })
  resumen(): Promise<AlertasResumen> {
    return this.alertas.resumen();
  }

  @Get('recientes')
  @ApiOperation({ summary: 'Últimas alertas activas para el popover de la campana (07.E)' })
  async recientes(
    @Query('limit', new DefaultValuePipe(3), ParseIntPipe) limit: number,
  ): Promise<{ data: Alerta[] }> {
    return { data: await this.alertas.recientes(limit) };
  }

  @Get('umbrales')
  @ApiOperation({ summary: 'Umbrales vigentes del motor de alertas (07.F)' })
  umbrales(): Promise<Umbrales> {
    return this.alertas.obtenerUmbrales();
  }

  @Put('umbrales')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Actualiza los umbrales — sólo jefe y supervisor' })
  guardarUmbrales(@Body() dto: UmbralesDto, @CurrentUser() user?: AuthUser): Promise<Umbrales> {
    return this.alertas.guardarUmbrales(dto, user?.nombre ?? 'Sistema');
  }

  @Post('confirmar-lote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma el evento real de varias alertas y recalcula EP' })
  confirmarLote(@Body() dto: ConfirmarLoteDto) {
    return this.alertas.confirmarLote(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle con los factores que explican la predicción (07.B)' })
  detalle(@Param('id') id: string): Promise<Alerta> {
    return this.alertas.detalle(id);
  }

  @Post(':id/atender')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra la acción tomada sobre la alerta' })
  atender(
    @Param('id') id: string,
    @Body() dto: AtenderAlertaDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<ResultadoMutacion> {
    return this.alertas.atender(id, dto, user?.nombre ?? 'Sistema');
  }

  @Post(':id/descartar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarta la alerta indicando el motivo' })
  descartar(
    @Param('id') id: string,
    @Body() dto: DescartarAlertaDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<ResultadoMutacion> {
    return this.alertas.descartar(id, dto, user?.nombre ?? 'Sistema');
  }

  @Post(':id/confirmar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma si el evento ocurrió; fija el acierto y recalcula EP (Anexo 06)' })
  confirmar(@Param('id') id: string, @Body() dto: ConfirmarEventoDto): Promise<ResultadoConfirmacion> {
    return this.alertas.confirmar(id, dto);
  }
}
