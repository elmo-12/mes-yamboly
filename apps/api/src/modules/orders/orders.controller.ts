import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuditEvent, OrdenListItem, OrdenesResumen, Paginated } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { Roles } from '../../common/decorators/roles';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import {
  CreateOrdenDto,
  FinalizeOrdenDto,
  ValidateOrdenDto,
} from './dto/orden-mutations.dto';
import { OrdenQueryDto } from './dto/orden-query.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('ordenes')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Listado de órdenes con filtros, orden y paginación' })
  @ApiResponse({ status: 200, description: 'Paginated<OrdenListItem>' })
  listar(@Query() query: OrdenQueryDto): Promise<Paginated<OrdenListItem>> {
    return this.orders.listar(query);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Contadores de las summary cards (spec 05.A)' })
  resumen(): Promise<OrdenesResumen> {
    return this.orders.resumen();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una orden — acepta id o código' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  detalle(@Param('id') id: string): Promise<OrdenListItem> {
    return this.orders.detalle(id);
  }

  @Post()
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Crea una orden de fabricación' })
  @ApiResponse({ status: 201, description: 'Orden creada' })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  crear(@Body() dto: CreateOrdenDto, @CurrentUser() user: AuthUser): Promise<OrdenListItem> {
    return this.orders.crear(dto, user);
  }

  @Post(':id/finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierra la orden y la deja Por validar' })
  @ApiResponse({ status: 409, description: 'La orden ya fue finalizada', type: ApiErrorDto })
  finalizar(
    @Param('id') id: string,
    @Body() dto: FinalizeOrdenDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OrdenListItem> {
    return this.orders.finalizar(id, dto, user);
  }

  @Post(':id/validar')
  @Roles('jefe', 'supervisor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valida la orden con el checklist de 4 puntos (RF12)' })
  @ApiResponse({ status: 409, description: 'En curso o ya validada', type: ApiErrorDto })
  validar(
    @Param('id') id: string,
    @Body() dto: ValidateOrdenDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OrdenListItem> {
    return this.orders.validar(id, dto, user);
  }

  @Get(':id/paradas')
  @ApiOperation({ summary: 'Paradas de la orden con su resumen' })
  paradas(@Param('id') id: string) {
    return this.orders.paradasDe(id);
  }

  @Get(':id/mermas')
  @ApiOperation({ summary: 'Mermas de la orden con su resumen' })
  mermas(@Param('id') id: string) {
    return this.orders.mermasDe(id);
  }

  @Get(':id/velocidades')
  @ApiOperation({ summary: 'Registros de velocidad de la orden' })
  velocidades(@Param('id') id: string) {
    return this.orders.velocidadesDe(id);
  }

  @Get(':id/bitacora')
  @ApiOperation({ summary: 'Bitácora RF12 de la orden, descendente por fecha' })
  @ApiQuery({
    name: 'tipo',
    required: false,
    description: 'creacion|edicion|parada|merma|velocidad|validacion|sistema',
  })
  bitacora(
    @Param('id') id: string,
    @Query('tipo') tipo?: string | string[],
  ): Promise<{ data: AuditEvent[] }> {
    return this.orders.bitacoraDe(id, tipo);
  }
}
