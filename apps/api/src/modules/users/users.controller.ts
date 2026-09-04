import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Colaborador, User } from '@mes/types';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user';
import { Roles } from '../../common/decorators/roles';
import { ApiErrorDto } from '../../common/dto/api-error.dto';
import {
  CambiarEstadoUsuarioDto,
  CreateUsuarioDto,
  RestablecerPasswordDto,
  UpdateUsuarioDto,
  UsuarioQueryDto,
} from './dto/usuario.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Directorio de personas. Lo consumen tanto Configuración → Sedes y usuarios
   * (jefe) como los selectores de captura de paradas/mermas/órdenes, que usa
   * cualquier rol autenticado: por eso el GET no lleva restricción de rol.
   */
  @Get('usuarios')
  @ApiOperation({ summary: 'Directorio de usuarios (responsable, maquinista, supervisor)' })
  @ApiResponse({ status: 200, description: '{ data: User[] }' })
  async listar(@Query() query: UsuarioQueryDto): Promise<{ data: User[] }> {
    return { data: await this.users.listar(query) };
  }

  @Post('usuarios')
  @Roles('jefe')
  @ApiOperation({ summary: 'Da de alta un usuario (hash bcrypt, iniciales derivadas)' })
  @ApiResponse({ status: 201, description: 'Usuario creado (sin el hash)' })
  @ApiResponse({ status: 409, description: 'Correo o DNI duplicado', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'Datos inválidos', type: ApiErrorDto })
  crear(@Body() dto: CreateUsuarioDto): Promise<User> {
    return this.users.crear(dto);
  }

  @Patch('usuarios/:id')
  @Roles('jefe')
  @ApiOperation({ summary: 'Edita un usuario (no acepta contraseña)' })
  @ApiResponse({ status: 404, description: 'No encontrado', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'Correo o DNI duplicado', type: ApiErrorDto })
  actualizar(@Param('id') id: string, @Body() dto: UpdateUsuarioDto): Promise<User> {
    return this.users.actualizar(id, dto);
  }

  @Post('usuarios/:id/estado')
  @Roles('jefe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activa o desactiva un usuario (un inactivo no puede iniciar sesión)' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 404, description: 'No encontrado', type: ApiErrorDto })
  @ApiResponse({ status: 422, description: 'No puedes desactivarte a ti mismo', type: ApiErrorDto })
  cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoUsuarioDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<User> {
    return this.users.cambiarEstado(id, dto.activo, usuario.id);
  }

  @Post('usuarios/:id/restablecer-password')
  @Roles('jefe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablece la contraseña de un usuario' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 404, description: 'No encontrado', type: ApiErrorDto })
  restablecerPassword(
    @Param('id') id: string,
    @Body() dto: RestablecerPasswordDto,
  ): Promise<User> {
    return this.users.restablecerPassword(id, dto);
  }

  @Get('colaboradores')
  @ApiOperation({ summary: 'Cuadrilla del turno — paso «Equipo» de la orden' })
  @ApiResponse({ status: 200, description: '{ data: Colaborador[] }' })
  colaboradores(): { data: Colaborador[] } {
    return { data: this.users.listarColaboradores() };
  }
}
