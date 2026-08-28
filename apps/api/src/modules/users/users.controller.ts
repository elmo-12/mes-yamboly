import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Colaborador, Sede, User } from '@mes/types';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Directorio de personas. Lo consumen tanto Configuración → Sedes y usuarios
   * (jefe) como los selectores de captura de paradas/mermas/órdenes, que usa
   * cualquier rol autenticado: por eso no lleva restricción de rol.
   */
  @Get('usuarios')
  @ApiOperation({ summary: 'Directorio de usuarios (responsable, maquinista, supervisor)' })
  @ApiQuery({ name: 'rol', required: false, description: 'Repetible o separado por comas' })
  @ApiQuery({ name: 'sedeId', required: false })
  @ApiQuery({
    name: 'lineaId',
    required: false,
    description: 'Incluye además a los usuarios sin línea asignada (jefe, supervisores, calidad)',
  })
  @ApiResponse({ status: 200, description: '{ data: User[] }' })
  async listar(
    @Query('rol') rol?: string | string[],
    @Query('sedeId') sedeId?: string,
    @Query('lineaId') lineaId?: string,
  ): Promise<{ data: User[] }> {
    return { data: await this.users.listar({ rol, sedeId, lineaId }) };
  }

  @Get('colaboradores')
  @ApiOperation({ summary: 'Cuadrilla del turno — paso «Equipo» de la orden' })
  @ApiResponse({ status: 200, description: '{ data: Colaborador[] }' })
  colaboradores(): { data: Colaborador[] } {
    return { data: this.users.listarColaboradores() };
  }

  @Get('sedes')
  @ApiOperation({ summary: 'Sedes de la planta' })
  @ApiResponse({ status: 200, description: '{ data: Sede[] }' })
  async sedes(): Promise<{ data: Sede[] }> {
    return { data: await this.users.listarSedes() };
  }
}
