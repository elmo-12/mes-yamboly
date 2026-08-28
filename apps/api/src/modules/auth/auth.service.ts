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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  /** El identificador acepta indistintamente correo o DNI. */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const identificador = dto.email.trim();
    const candidatos = await this.usuarios.find();
    const user = candidatos.find(
      (u) => normalizar(u.email) === normalizar(identificador) || u.dni === identificador,
    );

    if (!user || !user.activo || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas o sesión expirada');
    }

    user.ultimoAcceso = ahoraIso();
    await this.usuarios.save(user);

    const payload: JwtPayload = { sub: user.id, rol: user.rol, lineaId: user.lineaId ?? null };
    return { accessToken: await this.jwt.signAsync(payload), user: toUserDto(user) };
  }

  async perfil(id: string): Promise<UserDto> {
    const user = await this.usuarios.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException('Credenciales inválidas o sesión expirada');
    return toUserDto(user);
  }
}
