import { http, HttpResponse } from 'msw';
import type { Role, User } from '@mes/types';
import { ROLES } from '@mes/types';
import { colaboradoresBase } from '../data';
import type { UsuarioSeed } from '../data/users';
import { getStore, toUser } from '../store';
import { API, error, errores, listaQuery, normalizar, preludio } from './_utils';
import { usuarioDesdeToken } from './auth';

/** `Ana María Quispe` → `AQ`; una sola palabra → sus dos primeras letras. */
export function derivarIniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return 'SY';
  if (palabras.length === 1) return palabras[0]!.slice(0, 2).toUpperCase();
  return `${palabras[0]![0]}${palabras[palabras.length - 1]![0]}`.toUpperCase();
}

type Detalles = Record<string, string>;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/** Espejo de `UsuarioBaseDto` + `CreateUsuarioDto` (class-validator). */
function validarAlta(body: Record<string, unknown>): Detalles {
  const detalles: Detalles = {};
  if (texto(body.nombre).trim().length < 3) detalles.nombre = 'El nombre es obligatorio';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(body.email))) detalles.email = 'Correo inválido';
  if (!/^\d{8}$/.test(texto(body.dni))) detalles.dni = 'El DNI debe tener 8 dígitos';
  if (!ROLES.includes(texto(body.rol) as Role)) detalles.rol = 'Selecciona un rol';
  if (texto(body.cargo).trim().length < 2) detalles.cargo = 'El cargo es obligatorio';
  if (texto(body.password).length < 8) {
    detalles.password = 'La contraseña debe tener al menos 8 caracteres';
  }
  return detalles;
}

/** 409 `CONFLICT` cuando el correo o el DNI ya están en uso por otra persona. */
function duplicado(email: string | undefined, dni: string | undefined, excluirId?: string) {
  const usuarios = getStore().usuarios;
  if (email) {
    const otro = usuarios.find(
      (u) => u.id !== excluirId && normalizar(u.email) === normalizar(email)
    );
    if (otro) return errores.conflicto('Ya existe un usuario con ese correo', { email });
  }
  if (dni) {
    const otro = usuarios.find((u) => u.id !== excluirId && u.dni === dni);
    if (otro) return errores.conflicto('Ya existe un usuario con ese DNI', { dni });
  }
  return null;
}

/** Espejo de `apps/api/src/modules/users/users.controller.ts`. */
export const usersHandlers = [
  /**
   * Directorio de personas. Lo consumen Configuración → Usuarios y los
   * selectores de captura: sin restricción de rol, igual que la API.
   */
  http.get(`${API}/usuarios`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const roles = listaQuery(url, 'rol');
    const lineaId = url.searchParams.get('lineaId');
    const activo = url.searchParams.get('activo');

    let data: User[] = [...getStore().usuarios]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(toUser);
    if (roles.length > 0) data = data.filter((u) => roles.includes(u.rol));
    // Sin línea = transversal (jefe, supervisores, calidad): aparece en toda línea.
    if (lineaId) data = data.filter((u) => !u.lineaId || u.lineaId === lineaId);
    if (activo !== null) data = data.filter((u) => u.activo === (activo === 'true'));
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/usuarios`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles = validarAlta(body);
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const email = texto(body.email);
    const dni = texto(body.dni);
    const conflicto = duplicado(email, dni);
    if (conflicto) return conflicto;

    const nombre = texto(body.nombre);
    const nuevo: UsuarioSeed = {
      id: `USR-${String(store.usuarios.length + 1).padStart(2, '0')}`,
      nombre,
      email,
      dni,
      rol: texto(body.rol) as Role,
      cargo: texto(body.cargo),
      lineaId: (body.lineaId as string | null | undefined) ?? null,
      iniciales: derivarIniciales(nombre),
      activo: true,
      /* El mock guarda la contraseña en claro: no hay bcrypt en el navegador. */
      password: texto(body.password),
    };
    store.usuarios.push(nuevo);
    return HttpResponse.json(toUser(nuevo), { status: 201 });
  }),

  http.patch(`${API}/usuarios/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const usuario = store.usuarios.find((u) => u.id === params.id);
    if (!usuario) return errores.noEncontrado('Usuario');
    const body = (await request.json()) as Partial<User> & { password?: string };

    const conflicto = duplicado(
      body.email && body.email !== usuario.email ? body.email : undefined,
      body.dni && body.dni !== usuario.dni ? body.dni : undefined,
      usuario.id
    );
    if (conflicto) return conflicto;

    /* `password` se descarta (whitelist de la API): se cambia por restablecer. */
    const { password: _password, ...cambios } = body;
    Object.assign(usuario, cambios);
    if (body.lineaId !== undefined) usuario.lineaId = body.lineaId ?? null;
    if (body.nombre) usuario.iniciales = derivarIniciales(body.nombre);
    return HttpResponse.json(toUser(usuario));
  }),

  /** Un jefe no puede desactivarse a sí mismo: se quedaría sin mantenedor. */
  http.post(`${API}/usuarios/:id/estado`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const usuario = store.usuarios.find((u) => u.id === params.id);
    if (!usuario) return errores.noEncontrado('Usuario');
    const body = (await request.json()) as { activo?: boolean };
    if (typeof body.activo !== 'boolean') {
      return errores.validacion({ activo: 'Indica si el usuario queda activo' });
    }
    const solicitante = usuarioDesdeToken(request);
    if (!body.activo && solicitante?.id === usuario.id) {
      return error(422, 'BUSINESS_RULE', 'No puedes desactivar tu propia cuenta', {
        activo: 'No puedes desactivar tu propia cuenta',
      });
    }
    usuario.activo = body.activo;
    return HttpResponse.json(toUser(usuario));
  }),

  http.post(`${API}/usuarios/:id/restablecer-password`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const usuario = store.usuarios.find((u) => u.id === params.id);
    if (!usuario) return errores.noEncontrado('Usuario');
    const body = (await request.json()) as { password?: string };
    if (texto(body.password).length < 8) {
      return errores.validacion({ password: 'La contraseña debe tener al menos 8 caracteres' });
    }
    usuario.password = texto(body.password);
    return HttpResponse.json(toUser(usuario));
  }),

  /* Cuadrilla del turno — paso "Equipo" al iniciar una orden. */
  http.get(`${API}/colaboradores`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({ data: colaboradoresBase });
  }),
];
