import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { OrdenSapListItem, SincronizacionOrdenesSap } from '@mes/types';
import { Roles } from '../../common/decorators/roles';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { OrdenSapQueryDto } from './dto/orden-sap-query.dto';
import { OrdenesSapService } from './ordenes-sap.service';

@ApiTags('ordenes-sap')
@ApiBearerAuth()
@Controller('ordenes-sap')
export class OrdenesSapController {
  constructor(private readonly ordenesSap: OrdenesSapService) {}

  @Get()
  @ApiOperation({
    summary: 'Órdenes SAP pendientes (sin orden del MES y con producto mapeado)',
    description: 'Ordenadas por fecha ascendente y turno, como el paso «Seleccionar orden» del legado.',
  })
  @ApiResponse({ status: 200, description: '{ data: OrdenSapListItem[] }' })
  listar(@Query() query: OrdenSapQueryDto): Promise<{ data: OrdenSapListItem[] }> {
    return this.ordenesSap.listar(query);
  }

  @Post('sincronizar')
  @Roles('jefe', 'supervisor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lee del origen (sólo lectura) las órdenes SAP pendientes y las aplica' })
  @ApiResponse({ status: 200, description: 'SincronizacionOrdenesSap' })
  @ApiResponse({
    status: 503,
    description: 'Origen no configurado (ORIGEN_DATABASE_URL vacía)',
    type: ApiErrorDto,
  })
  sincronizar(): Promise<SincronizacionOrdenesSap> {
    return this.ordenesSap.sincronizar();
  }
}
