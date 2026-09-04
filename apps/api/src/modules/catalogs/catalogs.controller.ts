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
  CausaMermaNodo,
  CausaParada,
  CausaParadaNodo,
  Linea,
  LineaListItem,
  Producto,
  Sabor,
  TurnoDef,
  VelocidadEstandar,
  VelocidadEstandarListItem,
} from '@mes/types';
import { Roles } from '../../common/decorators/roles';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import { CatalogsService } from './catalogs.service';
import { BajaCausaParadaResponseDto, BajaLogicaResponseDto } from './dto/baja.dto';
import { LineaQueryDto, SaborQueryDto } from './dto/catalogo-query.dto';
import {
  CausaMermaQueryDto,
  CreateCausaMermaDto,
  UpdateCausaMermaDto,
} from './dto/causa-merma.dto';
import {
  CausaParadaQueryDto,
  CreateCausaParadaDto,
  UpdateCausaParadaDto,
} from './dto/causa-parada.dto';
import { CreateLineaDto, UpdateLineaDto } from './dto/linea.dto';
import { CreateProductoDto, ProductoQueryDto, UpdateProductoDto } from './dto/producto.dto';
import {
  CreateVelocidadEstandarDto,
  UpdateVelocidadEstandarDto,
  VelocidadEstandarQueryDto,
} from './dto/velocidad-estandar.dto';

@ApiTags('catalogs')
@ApiBearerAuth()
@Controller()
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  /* ------------------------------ Turnos ------------------------------ */

  @Get('turnos')
  @ApiOperation({ summary: 'Turnos de planta: Día (06–18) y Noche (18–06)' })
  @ApiResponse({ status: 200, description: '{ data: TurnoDef[] }' })
  async turnos(): Promise<{ data: TurnoDef[] }> {
    return { data: await this.catalogs.listarTurnos() };
  }

  /* ------------------------------ Sabores ----------------------------- */

  @Get('sabores')
  @ApiOperation({ summary: 'Catálogo de sabores del maestro real (41)' })
  @ApiResponse({ status: 200, description: '{ data: Sabor[] }' })
  async sabores(@Query() query: SaborQueryDto): Promise<{ data: Sabor[] }> {
    return { data: await this.catalogs.listarSabores(query.estado) };
  }

  /* ------------------------------ Líneas ------------------------------ */

  @Get('lineas')
  @ApiOperation({ summary: 'Líneas de planta (la línea es la máquina física)' })
  @ApiResponse({ status: 200, description: '{ data: LineaListItem[] }' })
  async lineas(@Query() query: LineaQueryDto): Promise<{ data: LineaListItem[] }> {
    return { data: await this.catalogs.listarLineas(query.tipoProceso, query.estado) };
  }

  @Post('lineas')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Registra una línea' })
  @ApiResponse({ status: 201, description: 'Línea creada' })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'Datos inválidos', type: ApiErrorDto })
  crearLinea(@Body() dto: CreateLineaDto): Promise<Linea> {
    return this.catalogs.crearLinea(dto);
  }

  @Patch('lineas/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Edita código, nombre, tipo de proceso, estado o capacidad' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  actualizarLinea(@Param('id') id: string, @Body() dto: UpdateLineaDto): Promise<Linea> {
    return this.catalogs.actualizarLinea(id, dto);
  }

  @Delete('lineas/:id')
  @Roles('jefe', 'supervisor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Baja lógica: la línea pasa a inactiva y conserva órdenes y paradas' })
  @ApiResponse({ status: 200, type: BajaLogicaResponseDto })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  bajaLinea(@Param('id') id: string): Promise<BajaLogicaResponseDto> {
    return this.catalogs.darDeBajaLinea(id);
  }

  /* ----------------------------- Productos ---------------------------- */

  @Get('productos')
  @ApiOperation({ summary: 'Productos del maestro real; `lineaId` filtra por par activo' })
  @ApiResponse({ status: 200, description: '{ data: Producto[] }' })
  async productos(@Query() query: ProductoQueryDto): Promise<{ data: Producto[] }> {
    return { data: await this.catalogs.listarProductos(query) };
  }

  @Post('productos')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Registra un producto' })
  @ApiResponse({ status: 201, description: 'Producto creado' })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'Datos inválidos', type: ApiErrorDto })
  crearProducto(@Body() dto: CreateProductoDto): Promise<Producto> {
    return this.catalogs.crearProducto(dto);
  }

  @Patch('productos/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Actualiza un producto (la velocidad vive en el par)' })
  @ApiResponse({ status: 404, description: 'No encontrado', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  actualizarProducto(@Param('id') id: string, @Body() dto: UpdateProductoDto): Promise<Producto> {
    return this.catalogs.actualizarProducto(id, dto);
  }

  @Delete('productos/:id')
  @Roles('jefe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Baja lógica: el producto pasa a inactivo y conserva sus órdenes' })
  @ApiResponse({ status: 200, type: BajaLogicaResponseDto })
  @ApiResponse({ status: 404, description: 'No encontrado', type: ApiErrorDto })
  bajaProducto(@Param('id') id: string): Promise<BajaLogicaResponseDto> {
    return this.catalogs.darDeBajaProducto(id);
  }

  /* ------------------------ Velocidades estándar ---------------------- */

  @Get('velocidades-estandar')
  @ApiOperation({ summary: 'Pares producto × línea con códigos y nombres resueltos' })
  @ApiResponse({ status: 200, description: '{ data: VelocidadEstandarListItem[] }' })
  async velocidadesEstandar(
    @Query() query: VelocidadEstandarQueryDto,
  ): Promise<{ data: VelocidadEstandarListItem[] }> {
    return { data: await this.catalogs.listarVelocidadesEstandar(query) };
  }

  @Post('velocidades-estandar')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Crea el par producto × línea (u/min se deriva de u/h)' })
  @ApiResponse({ status: 201, description: 'Par creado' })
  @ApiResponse({ status: 409, description: 'El par ya existe', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'Producto o línea inexistente', type: ApiErrorDto })
  crearVelocidadEstandar(
    @Body() dto: CreateVelocidadEstandarDto,
  ): Promise<VelocidadEstandar> {
    return this.catalogs.crearVelocidadEstandar(dto);
  }

  @Patch('velocidades-estandar/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Actualiza el par; recalcula u/min si cambia u/h' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'El par ya existe', type: ApiErrorDto })
  actualizarVelocidadEstandar(
    @Param('id') id: string,
    @Body() dto: UpdateVelocidadEstandarDto,
  ): Promise<VelocidadEstandar> {
    return this.catalogs.actualizarVelocidadEstandar(id, dto);
  }

  @Delete('velocidades-estandar/:id')
  @Roles('jefe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Baja lógica: el par pasa a inactivo; las órdenes conservan su valor' })
  @ApiResponse({ status: 200, type: BajaLogicaResponseDto })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  bajaVelocidadEstandar(@Param('id') id: string): Promise<BajaLogicaResponseDto> {
    return this.catalogs.darDeBajaVelocidadEstandar(id);
  }

  /* --------------------------- Causas de parada ----------------------- */

  @Get('causas-parada')
  @ApiOperation({ summary: 'Árbol Tipo → General → Específica (o listado plano)' })
  async causasParada(
    @Query() query: CausaParadaQueryDto,
  ): Promise<{ data: CausaParada[] | CausaParadaNodo[] }> {
    return {
      data: await this.catalogs.listarCausasParada(
        query.formato ?? 'arbol',
        query.nivel,
        query.lineaId,
      ),
    };
  }

  @Post('causas-parada')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Crea una causa de parada (acepta `codigoLegado`)' })
  @ApiResponse({ status: 201, description: 'Causa creada' })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  crearCausaParada(@Body() dto: CreateCausaParadaDto): Promise<CausaParada> {
    return this.catalogs.crearCausaParada(dto);
  }

  @Patch('causas-parada/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Actualiza una causa de parada (acepta `codigoLegado`)' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
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
  @ApiResponse({ status: 200, type: BajaCausaParadaResponseDto })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  bajaCausaParada(@Param('id') id: string): Promise<BajaCausaParadaResponseDto> {
    return this.catalogs.darDeBajaCausaParada(id);
  }

  /* --------------------------- Causas de merma ------------------------ */

  @Get('causas-merma')
  @ApiOperation({ summary: 'Árbol Tipo → Clasificación → Causa (o listado plano)' })
  @ApiQuery({ name: 'formato', required: false, enum: ['arbol', 'plano'] })
  async causasMerma(
    @Query() query: CausaMermaQueryDto,
  ): Promise<{ data: CausaMerma[] | CausaMermaNodo[] }> {
    return {
      data: await this.catalogs.listarCausasMerma(
        query.formato ?? 'arbol',
        query.nivel,
        query.tipo,
        query.lineaId,
      ),
    };
  }

  @Post('causas-merma')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Crea una causa de merma en cualquiera de los 3 niveles' })
  @ApiResponse({ status: 201, description: 'Causa creada' })
  @ApiResponse({ status: 409, description: 'Código duplicado', type: ApiErrorDto })
  crearCausaMerma(@Body() dto: CreateCausaMermaDto): Promise<CausaMerma> {
    return this.catalogs.crearCausaMerma(dto);
  }

  @Patch('causas-merma/:id')
  @Roles('jefe', 'supervisor')
  @ApiOperation({ summary: 'Actualiza una causa de merma' })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  actualizarCausaMerma(
    @Param('id') id: string,
    @Body() dto: UpdateCausaMermaDto,
  ): Promise<CausaMerma> {
    return this.catalogs.actualizarCausaMerma(id, dto);
  }

  @Delete('causas-merma/:id')
  @Roles('jefe', 'supervisor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Baja lógica: la causa se marca inactiva y conserva sus mermas' })
  @ApiResponse({ status: 200, type: BajaLogicaResponseDto })
  @ApiResponse({ status: 404, description: 'No encontrada', type: ApiErrorDto })
  bajaCausaMerma(@Param('id') id: string): Promise<BajaLogicaResponseDto> {
    return this.catalogs.darDeBajaCausaMerma(id);
  }
}
