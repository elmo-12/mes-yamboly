import { SetMetadata } from '@nestjs/common';
import type { Role } from '@mes/types';

export const ROLES_KEY = 'mes:roles';

/** `@Roles('jefe', 'supervisor')` — restringe el handler a esos roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
