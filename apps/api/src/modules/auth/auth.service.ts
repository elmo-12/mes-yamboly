import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcryptjs';
import { Repository } from 'typeorm';
import type { LoginResponse, User as UserDto } from '@mes/types';
import type { JwtPayload } from '../../common/decorators/current-user';
import { toUserDto } from '../../common/mappers/user.mapper';
import { ahoraIso, normalizar } from '../../common/utils/query';
import { User } from '../../database/entities';
import type { LoginDto } from './dto/login.dto';
import { LoginLimiter } from './login-limiter';

/** Payload del JWT con la versión de sesión (`tv`) para poder revocarla. */
export type JwtPayloadConVersion = JwtPayload & { tv?: number };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    private readonly jwt: JwtService,
    private readonly limitador: LoginLimiter,
  ) {}

  /** El identificador acepta indistintamente correo o DNI. */
  /** `ip` es `null` si no se pudo determinar con fiabilidad: solo aplica el límite por cuenta. */
  async login(dto: LoginDto, ip: string | null = null): Promise<LoginResponse> {
    const identificador = dto.email.trim();
    const candidatos = await this.usuarios.find();
    const user = candidatos.find(
      (u) => normalizar(u.email) === normalizar(identificador) || u.dni === identificador,
    );
    /* La clave de cuenta es el id si existe; si no, el identificador tecleado
     * (así un correo inexistente se bloquea igual y no delata si existe). */
    const cuenta = user?.id ?? `?${normalizar(identificador)}`;
    this.limitador.verificar(ip, cuenta);

    if (!user || !user.activo || !(await compare(dto.password, user.passwordHash))) {
      this.limitador.registrarFallo(ip, cuenta);
      throw new UnauthorizedException('Credenciales inválidas o sesión expirada');
    }
    this.limitador.registrarAcierto(cuenta);

    user.ultimoAcceso = ahoraIso();
    await this.usuarios.save(user);

    const payload: JwtPayloadConVersion = {
      sub: user.id,
      rol: user.rol,
      lineaId: user.lineaId ?? null,
      tv: user.tokenVersion ?? 0,
    };
    return { accessToken: await this.jwt.signAsync(payload), user: toUserDto(user) };
  }

  /**
   * Cierra **todas** las sesiones del usuario: el JWT no tiene estado, así que
   * se invalida subiendo `tokenVersion` (ver `JwtStrategy.validate`).
   */
  async revocarSesiones(id: string): Promise<void> {
    await this.usuarios.increment({ id }, 'tokenVersion', 1);
  }

  async perfil(id: string): Promise<UserDto> {
    const user = await this.usuarios.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas o sesión expirada');
    return toUserDto(user);
  }
}
