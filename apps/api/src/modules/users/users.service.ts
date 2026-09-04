import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Not, Repository } from 'typeorm';
import type { Colaborador, User as UserDto } from '@mes/types';
import {
  BusinessRuleException,
  ConflictoException,
  NoEncontradoException,
} from '../../common/exceptions/business.exception';
import { toUserDto } from '../../common/mappers/user.mapper';
import { normalizar, toList } from '../../common/utils/query';
import { User } from '../../database/entities';
import { colaboradoresBase } from '../../database/seeds/data/users';
import type {
  CreateUsuarioDto,
  RestablecerPasswordDto,
  UpdateUsuarioDto,
  UsuarioQueryDto,
} from './dto/usuario.dto';

/** Mismo coste que el seed (`usuarios.seeder.ts`), para que los hashes sean homogéneos. */
const BCRYPT_ROUNDS = 10;

/** `Ana María Quispe` → `AQ`; una sola palabra → sus dos primeras letras. */
export function derivarIniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return 'SY';
  if (palabras.length === 1) return palabras[0]!.slice(0, 2).toUpperCase();
  return `${palabras[0]![0]}${palabras[palabras.length - 1]![0]}`.toUpperCase();
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly usuarios: Repository<User>) {}

  async listar(query: UsuarioQueryDto = {}): Promise<UserDto[]> {
    const roles = toList(query.rol);
    const filas = await this.usuarios.find({ order: { id: 'ASC' } });
    return filas
      .filter((u) => (roles.length > 0 ? roles.includes(u.rol) : true))
      .filter((u) => (query.sedeId ? u.sedeId === query.sedeId : true))
      // Sin línea = transversal (jefe, supervisores, calidad): aparece en toda línea.
      .filter((u) => (query.lineaId ? !u.lineaId || u.lineaId === query.lineaId : true))
      .filter((u) => (query.activo === undefined ? true : u.activo === query.activo))
      .map(toUserDto);
  }

  /** Cuadrilla del turno para el paso «Equipo» de la orden de fabricación. */
  listarColaboradores(): Colaborador[] {
    return colaboradoresBase;
  }

  async crear(dto: CreateUsuarioDto): Promise<UserDto> {
    await this.verificarUnicidad(dto.email, dto.dni);
    const total = await this.usuarios.count();
    const usuario = this.usuarios.create({
      id: `USR-${String(total + 1).padStart(2, '0')}`,
      nombre: dto.nombre,
      email: dto.email,
      dni: dto.dni,
      rol: dto.rol,
      cargo: dto.cargo,
      sedeId: dto.sedeId,
      lineaId: dto.lineaId ?? null,
      iniciales: derivarIniciales(dto.nombre),
      avatarUrl: null,
      activo: true,
      ultimoAcceso: null,
      passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
    });
    await this.usuarios.save(usuario);
    return toUserDto(usuario);
  }

  async actualizar(id: string, dto: UpdateUsuarioDto): Promise<UserDto> {
    const usuario = await this.buscar(id);
    await this.verificarUnicidad(
      dto.email && dto.email !== usuario.email ? dto.email : undefined,
      dto.dni && dto.dni !== usuario.dni ? dto.dni : undefined,
      id,
    );
    Object.assign(usuario, dto);
    if (dto.lineaId !== undefined) usuario.lineaId = dto.lineaId ?? null;
    if (dto.nombre) usuario.iniciales = derivarIniciales(dto.nombre);
    await this.usuarios.save(usuario);
    return toUserDto(usuario);
  }

  /** Un jefe no puede desactivarse a sí mismo: se quedaría sin acceso al mantenedor. */
  async cambiarEstado(id: string, activo: boolean, solicitanteId: string): Promise<UserDto> {
    const usuario = await this.buscar(id);
    if (!activo && usuario.id === solicitanteId) {
      throw new BusinessRuleException('No puedes desactivar tu propia cuenta', {
        activo: 'No puedes desactivar tu propia cuenta',
      });
    }
    usuario.activo = activo;
    await this.usuarios.save(usuario);
    return toUserDto(usuario);
  }

  async restablecerPassword(id: string, dto: RestablecerPasswordDto): Promise<UserDto> {
    const usuario = await this.buscar(id);
    usuario.passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    await this.usuarios.save(usuario);
    return toUserDto(usuario);
  }

  private async buscar(id: string): Promise<User> {
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario) throw new NoEncontradoException('Usuario');
    return usuario;
  }

  /** 409 `CONFLICT` cuando el correo o el DNI ya están en uso por otra persona. */
  private async verificarUnicidad(email?: string, dni?: string, excluirId?: string): Promise<void> {
    if (email) {
      const filas = await this.usuarios.find(
        excluirId ? { where: { id: Not(excluirId) } } : undefined,
      );
      if (filas.some((u) => normalizar(u.email) === normalizar(email))) {
        throw new ConflictoException('Ya existe un usuario con ese correo', { email });
      }
    }
    if (dni) {
      const duplicado = await this.usuarios.findOne({ where: { dni } });
      if (duplicado && duplicado.id !== excluirId) {
        throw new ConflictoException('Ya existe un usuario con ese DNI', { dni });
      }
    }
  }
}
