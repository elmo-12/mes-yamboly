import { z } from 'zod';
import type { Role } from './common';

export interface User {
  id: string;
  nombre: string;
  email: string;
  dni: string;
  rol: Role;
  cargo: string;
  sedeId: string;
  /** Línea asignada (maquinistas). */
  lineaId?: string;
  iniciales: string;
  avatarUrl?: string;
  activo: boolean;
  /** Marca del último inicio de sesión (`YYYY-MM-DDTHH:mm:ss`); la muestra `/perfil`. */
  ultimoAcceso?: string;
}

export interface LoginRequest {
  /** Correo o DNI. */
  email: string;
  password: string;
  recordarme?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export const loginSchema = z.object({
  email: z.string().min(1, 'Ingresa tu correo o DNI'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  recordarme: z.boolean().default(false),
});
export type LoginInput = z.infer<typeof loginSchema>;
