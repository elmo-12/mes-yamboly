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
import { ROLES_ATENDER_ALERTA, ROLES_CONFIRMAR_EP, ROLES_EDITAR_UMBRALES } from '@mes/types';
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
  @Roles(...ROLES_EDITAR_UMBRALES)
  @ApiOperation({ summary: 'Actualiza los umbrales — sólo jefe y supervisor' })
  guardarUmbrales(@Body() dto: UmbralesDto, @CurrentUser() user?: AuthUser): Promise<Umbrales> {
    return this.alertas.guardarUmbrales(dto, user?.nombre ?? 'Sistema');
  }

  @Post('confirmar-lote')
  @Roles(...ROLES_CONFIRMAR_EP)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirma el evento real de varias alertas y recalcula EP — jefe y supervisor',
    description: 'Atómico: si una alerta no existe (404), está repetida (422) o no admite confirmación (409), no se confirma ninguna.',
  })
  confirmarLote(@Body() dto: ConfirmarLoteDto) {
    return this.alertas.confirmarLote(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle con los factores que explican la predicción (07.B)' })
  detalle(@Param('id') id: string): Promise<Alerta> {
    return this.alertas.detalle(id);
  }

  @Post(':id/atender')
  @Roles(...ROLES_ATENDER_ALERTA)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registra la acción tomada sobre la alerta — jefe, supervisor y maquinista de la línea',
    description: 'Solo desde `activa` (409 si no). El maquinista solo en su línea (403).',
  })
  atender(
    @Param('id') id: string,
    @Body() dto: AtenderAlertaDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ResultadoMutacion> {
    return this.alertas.atender(id, dto, user);
  }

  @Post(':id/descartar')
  @Roles(...ROLES_ATENDER_ALERTA)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Descarta la alerta indicando el motivo — jefe, supervisor y maquinista de la línea',
    description: 'Solo desde `activa` (409 si no). Una descartada no puede confirmarse ni cuenta en la EP.',
  })
  descartar(
    @Param('id') id: string,
    @Body() dto: DescartarAlertaDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ResultadoMutacion> {
    return this.alertas.descartar(id, dto, user);
  }

  @Post(':id/confirmar')
  @Roles(...ROLES_CONFIRMAR_EP)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirma si el evento ocurrió; fija el acierto y recalcula EP (Anexo 06) — jefe y supervisor',
    description: 'Desde `atendida`/`vencida` (o `activa` con la ventana cerrada); 409 en otro caso.',
  })
  confirmar(@Param('id') id: string, @Body() dto: ConfirmarEventoDto): Promise<ResultadoConfirmacion> {
    return this.alertas.confirmar(id, dto);
  }
}
