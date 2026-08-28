import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Paginated, RegistroVelocidadListItem } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { CreateVelocidadDto, VelocidadQueryDto } from './dto/velocidad.dto';
import { SpeedsService } from './speeds.service';

@ApiTags('speeds')
@ApiBearerAuth()
@Controller('velocidades')
export class SpeedsController {
  constructor(private readonly speeds: SpeedsService) {}

  @Get()
  @ApiOperation({ summary: 'Registros de velocidad con paginación' })
  listar(@Query() query: VelocidadQueryDto): Promise<Paginated<RegistroVelocidadListItem>> {
    return this.speeds.listar(query);
  }

  @Post()
  @ApiOperation({ summary: 'Registra una velocidad y calcula el desvío vs estándar' })
  @ApiResponse({ status: 201, description: 'Registro creado con desvioPct' })
  @ApiResponse({ status: 422, description: 'Velocidad ≤ 0', type: ApiErrorDto })
  crear(
    @Body() dto: CreateVelocidadDto,
    @CurrentUser() user: AuthUser,
  ): Promise<RegistroVelocidadListItem> {
    return this.speeds.crear(dto, user);
  }
}
