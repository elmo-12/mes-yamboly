import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { DeteccionIoT, Paginated, ParadaListItem } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { DowntimesService } from './downtimes.service';
import {
  ConfirmarDeteccionDto,
  CreateParadaDto,
  FinalizeParadaDto,
  ParadaQueryDto,
  UpdateParadaDto,
} from './dto/parada.dto';

@ApiTags('downtimes')
@ApiBearerAuth()
@Controller()
export class DowntimesController {
  constructor(private readonly downtimes: DowntimesService) {}

  @Get('paradas')
  @ApiOperation({ summary: 'Listado de paradas con filtros y paginación' })
  listar(@Query() query: ParadaQueryDto): Promise<Paginated<ParadaListItem>> {
    return this.downtimes.listar(query);
  }

  @Post('paradas')
  @ApiOperation({ summary: 'Registra una parada (acción tomada obligatoria)' })
  @ApiResponse({ status: 201, description: 'Parada creada' })
  @ApiResponse({
    status: 422,
    description: 'Causa inválida, acción tomada o nº de solicitud faltante',
    type: ApiErrorDto,
  })
  crear(@Body() dto: CreateParadaDto, @CurrentUser() user: AuthUser): Promise<ParadaListItem> {
    return this.downtimes.crear(dto, user);
  }

  @Patch('paradas/:id')
  @ApiOperation({ summary: 'Edita una parada — el cambio de causa se escribe en la bitácora' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  actualizar(
    @Param('id') id: string,
    @Body() dto: UpdateParadaDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ParadaListItem> {
    return this.downtimes.actualizar(id, dto, user);
  }

  @Post('paradas/:id/finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierra la parada y calcula su duración' })
  @ApiResponse({ status: 409, description: 'Ya finalizada', type: ApiErrorDto })
  finalizar(
    @Param('id') id: string,
    @Body() dto: FinalizeParadaDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ParadaListItem> {
    return this.downtimes.finalizar(id, dto, user);
  }

  @Get('detecciones-iot')
  @ApiOperation({ summary: 'Detecciones del sensor de movimiento' })
  @ApiQuery({ name: 'estado', required: false, enum: ['sugerida', 'confirmada', 'descartada'] })
  async detecciones(@Query('estado') estado?: string): Promise<{ data: DeteccionIoT[] }> {
    return { data: await this.downtimes.listarDetecciones(estado) };
  }

  @Post('detecciones-iot/:id/confirmar')
  @ApiOperation({ summary: 'Confirma la detección y crea la parada de origen IoT' })
  @ApiResponse({ status: 201, description: '{ deteccion, parada }' })
  @ApiResponse({ status: 409, description: 'Ya procesada', type: ApiErrorDto })
  confirmar(
    @Param('id') id: string,
    @Body() dto: ConfirmarDeteccionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.downtimes.confirmarDeteccion(id, dto, user);
  }

  @Post('detecciones-iot/:id/descartar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarta la detección sin crear parada' })
  descartar(@Param('id') id: string): Promise<DeteccionIoT> {
    return this.downtimes.descartarDeteccion(id);
  }
}
