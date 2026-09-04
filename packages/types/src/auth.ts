import { z } from 'zod';
import { ROLES } from './common';
import type { Role } from './common';

export interface User {
  id: string;
  nombre: string;
  email: string;
  dni: string;
  rol: Role;
  cargo: string;
  /** Línea asignada (maquinistas): `LIN-LLEN-M2`; `null` para el resto de roles. */
  lineaId?: string | null;
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

/* ------------------------------------------------------------------ */
/* Mantenedor de usuarios (`jefe`)                                     */
/* ------------------------------------------------------------------ */

/** Campos comunes al alta y a la edición de usuario. */
const usuarioBaseShape = {
  nombre: z.string().min(3, 'El nombre es obligatorio'),
  email: z.string().email('Correo inválido'),
  dni: z.string().regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos'),
  rol: z.enum(ROLES, { errorMap: () => ({ message: 'Selecciona un rol' }) }),
  cargo: z.string().min(2, 'El cargo es obligatorio'),
  lineaId: z.string().nullable().default(null),
};

/**
 * Alta de usuario (`POST /usuarios`).
 *
 * @example
 * { nombre: 'Ana Quispe', email: 'ana.quispe@yamboly.lat', dni: '45871203',
 *   rol: 'maquinista', cargo: 'Maquinista de línea',
 *   lineaId: 'LIN-LLEN-M2', password: 'Yamboly2026', confirmacion: 'Yamboly2026' }
 */
export const crearUsuarioSchema = z
  .object({
    ...usuarioBaseShape,
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmacion: z.string().min(8, 'Confirma la contraseña'),
  })
  .refine((v) => v.password === v.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  });
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

/** Edición de usuario (`PATCH /usuarios/:id`): mismos campos, sin contraseña. */
export const actualizarUsuarioSchema = z.object(usuarioBaseShape).partial();
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;

/** Restablecer contraseña (`POST /usuarios/:id/restablecer-password`). */
export const restablecerPasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmacion: z.string().min(8, 'Confirma la contraseña'),
  })
  .refine((v) => v.password === v.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  });
export type RestablecerPasswordInput = z.infer<typeof restablecerPasswordSchema>;

/** Activar/desactivar usuario (`POST /usuarios/:id/estado`); 409 si es uno mismo. */
export const cambiarEstadoUsuarioSchema = z.object({
  activo: z.boolean(),
});
export type CambiarEstadoUsuarioInput = z.infer<typeof cambiarEstadoUsuarioSchema>;
