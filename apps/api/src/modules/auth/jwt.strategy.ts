import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import type { EnvVars } from '../../config/env.validation';
import type { AuthUser, JwtPayload } from '../../common/decorators/current-user';
import { User } from '../../database/entities';

/**
 * `EventSource` no admite cabeceras, así que la única ruta que acepta el token
 * por query es el canal SSE del tablero. Cualquier otra ruta lo ignora para no
 * dejar credenciales en logs de acceso ni en el `Referer`.
 */
const RUTA_SSE = '/api/v1/tiempo-real/stream';

function tokenDesdeQuerySoloSse(request: Request): string | null {
  if (request.path !== RUTA_SSE) return null;
  const token = request.query?.token;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<EnvVars, true>,
    @InjectRepository(User) private readonly usuarios: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        tokenDesdeQuerySoloSse,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usuarios.findOne({ where: { id: payload.sub } });
    if (!user || !user.activo) {
      throw new UnauthorizedException('Credenciales inválidas o sesión expirada');
    }
    return {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      iniciales: user.iniciales,
      lineaId: user.lineaId ?? null,
    };
  }
}
