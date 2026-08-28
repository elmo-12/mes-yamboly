import type { User as UserDto } from '@mes/types';
import type { User } from '../../database/entities';

/** Vista pública de un usuario: sin `passwordHash` y sin `null` en opcionales. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    dni: user.dni,
    rol: user.rol,
    cargo: user.cargo,
    sedeId: user.sedeId,
    lineaId: user.lineaId ?? undefined,
    iniciales: user.iniciales,
    avatarUrl: user.avatarUrl ?? undefined,
    activo: user.activo,
    ultimoAcceso: user.ultimoAcceso ?? undefined,
  };
}
