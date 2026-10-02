import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcryptjs';
import { Not, Repository } from 'typeorm';
import { MENSAJE_MAQUINISTA_SIN_LINEA, SEDE_UNICA_ID } from '@mes/types';
import type { Colaborador, User as UserDto } from '@mes/types';
import {
  BusinessRuleException,
  ConflictoException,
  NoEncontradoException,
  ValidationException,
} from '../../common/exceptions/business.exception';
import { toUserDto } from '../../common/mappers/user.mapper';
import { insertarConIdSecuencial } from '../../common/utils/ids';
import { normalizar, toList } from '../../common/utils/query';
import { Linea, User } from '../../database/entities';
import { colaboradoresBase } from '../../database/seeds/data/users';
import type {
  CreateUsuarioDto,
  RestablecerPasswordDto,
  UpdateUsuarioDto,
  UsuarioQueryDto,
} from './dto/usuario.dto';

/** M9: un maquinista sin línea no podría registrar nada (la captura se ata a su línea). */
function verificarLineaMaquinista(rol: string, lineaId: string | null | undefined): void {
  if (rol === 'maquinista' && !lineaId) {
    throw new ValidationException({ lineaId: MENSAJE_MAQUINISTA_SIN_LINEA });
  }
}

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
  constructor(
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
  ) {}

  async listar(query: UsuarioQueryDto = {}): Promise<UserDto[]> {
    const roles = toList(query.rol);
    const filas = await this.usuarios.find({ order: { id: 'ASC' } });
    return filas
      .filter((u) => (roles.length > 0 ? roles.includes(u.rol) : true))
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
    await this.verificarLinea(dto.lineaId);
    verificarLineaMaquinista(dto.rol, dto.lineaId);
    const usuario = this.usuarios.create({
      /* El id lo asigna `insertarConIdSecuencial` (INSERT puro con reintento):
       * con `count() + 1` y `save()`, un hueco en la numeración (usuarios
       * importados del legado) hacía que el alta pisara a otro usuario. */
      id: '',
      nombre: dto.nombre,
      email: dto.email.trim().toLowerCase(),
      dni: dto.dni,
      rol: dto.rol,
      cargo: dto.cargo,
      /* Columna interna heredada: la app opera una única sede. */
      sedeId: SEDE_UNICA_ID,
      lineaId: dto.lineaId ?? null,
      iniciales: derivarIniciales(dto.nombre),
      avatarUrl: null,
      activo: true,
      ultimoAcceso: null,
      passwordHash: await hash(dto.password, BCRYPT_ROUNDS),
    });
    await insertarConIdSecuencial(this.usuarios, usuario, (n) => `USR-${String(n).padStart(2, '0')}`);
    return toUserDto(usuario);
  }

  async actualizar(id: string, dto: UpdateUsuarioDto, solicitanteId?: string): Promise<UserDto> {
    const usuario = await this.buscar(id);
    await this.verificarUnicidad(
      dto.email && dto.email !== usuario.email ? dto.email : undefined,
      dto.dni && dto.dni !== usuario.dni ? dto.dni : undefined,
      id,
    );
    await this.verificarLinea(dto.lineaId);
    verificarLineaMaquinista(
      dto.rol ?? usuario.rol,
      dto.lineaId !== undefined ? dto.lineaId : usuario.lineaId,
    );
    const pierdeJefatura = usuario.rol === 'jefe' && dto.rol !== undefined && dto.rol !== 'jefe';
    if (pierdeJefatura && usuario.id === solicitanteId) {
      throw new BusinessRuleException('No puedes quitarte el rol de jefe de producción', {
        rol: 'No puedes quitarte el rol de jefe de producción',
      });
    }
    if (pierdeJefatura) await this.verificarOtroJefeActivo(usuario.id, 'rol');

    const cambiaAcceso =
      (dto.rol !== undefined && dto.rol !== usuario.rol) ||
      (dto.lineaId !== undefined && (dto.lineaId ?? null) !== (usuario.lineaId ?? null));
    Object.assign(usuario, dto);
    if (dto.lineaId !== undefined) usuario.lineaId = dto.lineaId ?? null;
    if (dto.nombre) usuario.iniciales = derivarIniciales(dto.nombre);
    /* Un cambio de rol o de línea obliga a iniciar sesión de nuevo: la web
     * guarda el rol de la sesión y, si no, seguiría mostrando el anterior. */
    if (cambiaAcceso) usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1;
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
    if (!activo && usuario.rol === 'jefe' && usuario.activo) {
      await this.verificarOtroJefeActivo(usuario.id, 'activo');
    }
    /* Dar de baja revoca las sesiones abiertas (el token deja de valer). */
    if (!activo && usuario.activo) usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1;
    usuario.activo = activo;
    await this.usuarios.save(usuario);
    return toUserDto(usuario);
  }

  async restablecerPassword(id: string, dto: RestablecerPasswordDto): Promise<UserDto> {
    const usuario = await this.buscar(id);
    usuario.passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    /* Contraseña nueva = las sesiones con la anterior dejan de valer. */
    usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1;
    await this.usuarios.save(usuario);
    return toUserDto(usuario);
  }

  private async buscar(id: string): Promise<User> {
    const usuario = await this.usuarios.findOne({ where: { id } });
    if (!usuario) throw new NoEncontradoException('Usuario');
    return usuario;
  }

  /** 422 si `lineaId` no existe (antes la FK reventaba con 500). */
  private async verificarLinea(lineaId?: string | null): Promise<void> {
    if (!lineaId) return;
    if ((await this.lineas.count({ where: { id: lineaId } })) === 0) {
      throw new ValidationException({ lineaId: 'La línea seleccionada no existe' });
    }
  }

  /** La planta no puede quedarse sin ningún jefe de producción activo. */
  private async verificarOtroJefeActivo(id: string, campo: 'rol' | 'activo'): Promise<void> {
    const otros = await this.usuarios.count({ where: { rol: 'jefe', activo: true, id: Not(id) } });
    if (otros === 0) {
      const mensaje = 'Debe quedar al menos un jefe de producción activo';
      throw new BusinessRuleException(mensaje, { [campo]: mensaje });
    }
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
