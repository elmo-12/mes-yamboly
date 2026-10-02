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
  nombre: z.string().trim().min(3, 'El nombre es obligatorio').max(120, 'Máximo 120 caracteres'),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(120, 'Máximo 120 caracteres'),
  dni: z.string().regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos'),
  rol: z.enum(ROLES, { errorMap: () => ({ message: 'Selecciona un rol' }) }),
  cargo: z.string().trim().min(2, 'El cargo es obligatorio').max(80, 'Máximo 80 caracteres'),
  lineaId: z.string().nullable().default(null),
};

/** Mensaje compartido por la web y la API: el maquinista trabaja en una línea. */
export const MENSAJE_MAQUINISTA_SIN_LINEA = 'Asigna la línea del maquinista';

/** Un maquinista sin línea no puede registrar nada (la captura se limita a su línea). */
function maquinistaConLinea(v: { rol?: string; lineaId?: string | null }): boolean {
  return v.rol !== 'maquinista' || (v.lineaId !== null && v.lineaId !== undefined && v.lineaId !== '');
}

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
  })
  .refine(maquinistaConLinea, { message: MENSAJE_MAQUINISTA_SIN_LINEA, path: ['lineaId'] });
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

/** Edición de usuario (`PATCH /usuarios/:id`): mismos campos, sin contraseña. */
export const actualizarUsuarioSchema = z
  .object(usuarioBaseShape)
  .partial()
  /* En la edición parcial solo se puede comprobar si llegan rol y línea juntos;
   * la API valida además el estado final del usuario. */
  .refine((v) => v.rol === undefined || v.lineaId === undefined || maquinistaConLinea(v), {
    message: MENSAJE_MAQUINISTA_SIN_LINEA,
    path: ['lineaId'],
  });
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
