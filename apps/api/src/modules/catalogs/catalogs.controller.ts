import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  CausaMerma,
  CausaParada,
  CausaParadaNodo,
  Linea,
  Maquina,
  Producto,
  TurnoDef,
} from '@mes/types';
import { Roles } from '../../common/decorators/roles';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { CatalogsService } from './catalogs.service';
import {
  BajaCausaResponseDto,
  CausaParadaQueryDto,
  CreateCausaParadaDto,
  UpdateCausaParadaDto,
} from './dto/causa-parada.dto';
import { CreateMaquinaDto, MaquinaQueryDto, UpdateMaquinaDto } from './dto/maquina.dto';
import { UpdateProductoDto } from './dto/producto.dto';

@ApiTags('catalogs')
@ApiBearerAuth()
@Controller()
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get('turnos')
  @ApiOperation({ summary: 'Turnos Mañana/Tarde/Noche' })
  async turnos(): Promise<{ data: TurnoDef[] }> {
    return { data: await this.catalogs.listarTurnos() };
  }

  @Get('lineas')
  @ApiOperation({ summary: 'Líneas L1…L5 + PT-01' })
  @ApiQuery({ name: 'sedeId', required: false })
  async lineas(@Query('sedeId') sedeId?: string): Promise<{ data: Linea[] }> {
    return { data: await this.catalogs.listarLineas(sedeId) };
  }

  @Get('productos')
  @ApiOperation({ summary: 'Productos con velocidad estándar' })
  @ApiQuery({ name: 'lineaId', required: false })
  async productos(@Query('lineaId') lineaId?: string): Promise<{ data: Producto[] }> {
    return { data: await this.catalogs.listarProductos(lineaId) };
  }

  @Patch('productos/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Ajusta la velocidad estándar / el estado de un producto' })
  @ApiResponse({ status: 404, description: 'No encontrado', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'Velocidad fuera de rango', type: ApiErrorDto })
  actualizarProducto(@Param('id') id: string, @Body() dto: UpdateProductoDto): Promise<Producto> {
    return this.catalogs.actualizarProducto(id, dto);
  }

  @Get('maquinas')
  @ApiOperation({ summary: 'Máquinas por línea y estado' })
  async maquinas(@Query() query: MaquinaQueryDto): Promise<{ data: Maquina[] }> {
    return { data: await this.catalogs.listarMaquinas(query.lineaId, query.estado) };
  }

  @Post('maquinas')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Registra una máquina' })
  @ApiResponse({ status: 201, description: 'Máquina creada' })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  crearMaquina(@Body() dto: CreateMaquinaDto): Promise<Maquina> {
    return this.catalogs.crearMaquina(dto);
  }

  @Patch('maquinas/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Actualiza una máquina' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  actualizarMaquina(@Param('id') id: string, @Body() dto: UpdateMaquinaDto): Promise<Maquina> {
    return this.catalogs.actualizarMaquina(id, dto);
  }

  @Get('causas-parada')
  @ApiOperation({ summary: 'Árbol Tipo → General → Específica (o listado plano)' })
  async causasParada(
    @Query() query: CausaParadaQueryDto,
  ): Promise<{ data: CausaParada[] | CausaParadaNodo[] }> {
    return {
      data: await this.catalogs.listarCausasParada(query.formato ?? 'arbol', query.nivel, query.lineaId),
    };
  }

  @Post('causas-parada')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Crea una causa de parada' })
  @ApiResponse({ status: 201, description: 'Causa creada' })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  crearCausaParada(@Body() dto: CreateCausaParadaDto): Promise<CausaParada> {
    return this.catalogs.crearCausaParada(dto);
  }

  @Patch('causas-parada/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Actualiza una causa de parada' })
  actualizarCausaParada(
    @Param('id') id: string,
    @Body() dto: UpdateCausaParadaDto,
  ): Promise<CausaParada> {
    return this.catalogs.actualizarCausaParada(id, dto);
  }

  @Delete('causas-parada/:id')
  @Roles('jefe', 'supervisor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Baja lógica: la causa se marca inactiva y conserva su histórico' })
  @ApiResponse({ status: 200, type: BajaCausaResponseDto })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  bajaCausaParada(@Param('id') id: string): Promise<BajaCausaResponseDto> {
    return this.catalogs.darDeBajaCausaParada(id);
  }

  @Get('causas-merma')
  @ApiOperation({ summary: 'Causas de merma MR-01…MR-04' })
  @ApiQuery({ name: 'tipo', required: false, enum: ['MP', 'EP', 'PT'] })
  async causasMerma(@Query('tipo') tipo?: string): Promise<{ data: CausaMerma[] }> {
    return { data: await this.catalogs.listarCausasMerma(tipo) };
  }
}
