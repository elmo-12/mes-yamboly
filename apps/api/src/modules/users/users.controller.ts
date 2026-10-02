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

/** Vista sin datos personales sensibles (DNI, correo, último acceso). */
export type UsuarioDirectorio = Omit<User, 'email' | 'dni' | 'ultimoAcceso'>;

function aDirectorio(u: User): UsuarioDirectorio {
  const { email: _email, dni: _dni, ultimoAcceso: _ultimo, ...resto } = u;
  return resto;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Directorio de personas. Lo consumen Configuración → Usuarios (jefe) y los
   * selectores de responsable/maquinista/invitado, que usan otros roles. Solo
   * el jefe recibe la ficha completa; el resto recibe la vista reducida (sin
   * DNI, correo ni último acceso), que es lo que necesitan esos selectores:
   * el DNI es también identificador de inicio de sesión.
   */
  @Get('usuarios')
  @ApiOperation({ summary: 'Directorio de usuarios · ficha completa solo para el jefe' })
  @ApiResponse({ status: 200, description: '{ data: User[] } (sin email/dni/ultimoAcceso si no eres jefe)' })
  async listar(
    @Query() query: UsuarioQueryDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<{ data: Array<User | UsuarioDirectorio> }> {
    const esJefe = usuario?.rol === 'jefe';
    /* Los selectores (otros roles) solo ven personas activas (M2): se fuerza,
     * no es un valor por defecto, para que `?activo=false` no liste las bajas. */
    const filas = await this.users.listar(esJefe ? query : { ...query, activo: true });
    return { data: esJefe ? filas : filas.map(aDirectorio) };
  }

  @Get('usuarios/directorio')
  @ApiOperation({ summary: 'Directorio reducido (id, nombre, rol, cargo, línea, iniciales, activo)' })
  @ApiResponse({ status: 200, description: '{ data: UsuarioDirectorio[] }' })
  async directorio(
    @Query() query: UsuarioQueryDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<{ data: UsuarioDirectorio[] }> {
    /* Solo el jefe puede pedir las bajas (`activo=false`); el resto, siempre activos. */
    const activo = usuario?.rol === 'jefe' ? (query.activo ?? true) : true;
    return { data: (await this.users.listar({ ...query, activo })).map(aDirectorio) };
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
  actualizar(
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() usuario: AuthUser,
  ): Promise<User> {
    return this.users.actualizar(id, dto, usuario.id);
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
