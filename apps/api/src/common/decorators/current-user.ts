import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@mes/types';

/** Payload firmado en el JWT. */
export interface JwtPayload {
  sub: string;
  rol: Role;
  lineaId?: string | null;
}

/** Usuario resuelto por `JwtStrategy` y adjuntado a `request.user`. */
export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: Role;
  iniciales: string;
  lineaId?: string | null;
}

/** `@CurrentUser() user: AuthUser` — inyecta el usuario autenticado. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
