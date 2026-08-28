import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { MermaListItem, Paginated } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { CreateMermaDto, MermaQueryDto, UpdateMermaDto } from './dto/merma.dto';
import { ScrapService } from './scrap.service';

@ApiTags('scrap')
@ApiBearerAuth()
@Controller('mermas')
export class ScrapController {
  constructor(private readonly scrap: ScrapService) {}

  @Get()
  @ApiOperation({ summary: 'Listado de mermas con filtros y paginación' })
  listar(@Query() query: MermaQueryDto): Promise<Paginated<MermaListItem>> {
    return this.scrap.listar(query);
  }

  @Post()
  @ApiOperation({ summary: 'Registra una merma (MP · EP · PT)' })
  @ApiResponse({ status: 201, description: 'Merma creada' })
  @ApiResponse({ status: 422, description: 'Cantidad ≤ 0 o causa inválida', type: ApiErrorDto })
  crear(@Body() dto: CreateMermaDto, @CurrentUser() user: AuthUser): Promise<MermaListItem> {
    return this.scrap.crear(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita una merma' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  actualizar(
    @Param('id') id: string,
    @Body() dto: UpdateMermaDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MermaListItem> {
    return this.scrap.actualizar(id, dto, user);
  }
}
