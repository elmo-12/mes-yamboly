import { http, HttpResponse } from 'msw';
import type { Role, User } from '@mes/types';
import { MENSAJE_MAQUINISTA_SIN_LINEA, ROLES } from '@mes/types';
import { colaboradoresBase } from '../data';
import type { UsuarioSeed } from '../data/users';
import { getStore, toUser } from '../store';
import { API, error, errores, listaQuery, normalizar, preludio } from './_utils';
import { exigeRol, usuarioDesdeToken } from './auth';

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

/** Espejo de `UsuarioBaseDto` (class-validator); `parcial` = edición (`PATCH`). */
function validarCampos(body: Record<string, unknown>, parcial = false): Detalles {
  const detalles: Detalles = {};
  const presente = (campo: string) => !parcial || body[campo] !== undefined;
  const nombre = texto(body.nombre).trim();
  if (presente('nombre')) {
    if (nombre.length < 3) detalles.nombre = 'El nombre es obligatorio';
    else if (nombre.length > 120) detalles.nombre = 'Máximo 120 caracteres';
  }
  const email = texto(body.email).trim();
  if (presente('email')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) detalles.email = 'Correo inválido';
    else if (email.length > 120) detalles.email = 'Máximo 120 caracteres';
  }
  if (presente('dni') && !/^\d{8}$/.test(texto(body.dni))) detalles.dni = 'El DNI debe tener 8 dígitos';
  if (presente('rol') && !ROLES.includes(texto(body.rol) as Role)) detalles.rol = 'Selecciona un rol';
  const cargo = texto(body.cargo).trim();
  if (presente('cargo')) {
    if (cargo.length < 2) detalles.cargo = 'El cargo es obligatorio';
    else if (cargo.length > 80) detalles.cargo = 'Máximo 80 caracteres';
  }
  /* Espejo de `verificarLinea`: 422 si la línea no existe (antes la FK daba 500). */
  const lineaId = body.lineaId;
  if (typeof lineaId === 'string' && lineaId && !getStore().lineas.some((l) => l.id === lineaId)) {
    detalles.lineaId = 'La línea seleccionada no existe';
  }
  return detalles;
}

/** Espejo de `UsuarioBaseDto` + `CreateUsuarioDto` (class-validator). */
function validarAlta(body: Record<string, unknown>): Detalles {
  const detalles = validarCampos(body);
  if (texto(body.password).length < 8) {
    detalles.password = 'La contraseña debe tener al menos 8 caracteres';
  }
  return detalles;
}

/** M9: un maquinista sin línea no podría registrar nada (la captura se ata a su línea). */
function maquinistaSinLinea(rol: string, lineaId: string | null | undefined): boolean {
  return rol === 'maquinista' && !lineaId;
}

/** Vista sin datos personales (DNI, correo, último acceso): la de los selectores. */
type UsuarioDirectorio = Omit<User, 'email' | 'dni' | 'ultimoAcceso'>;

function aDirectorio(u: User): UsuarioDirectorio {
  const { email: _email, dni: _dni, ultimoAcceso: _ultimo, ...resto } = u;
  return resto;
}

/** Filtros de `UsuarioQueryDto`; `activoPorDefecto` se aplica si no llega `activo`. */
function listarUsuarios(url: URL, activoPorDefecto?: boolean): User[] {
  const roles = listaQuery(url, 'rol');
  const lineaId = url.searchParams.get('lineaId');
  const activoQ = url.searchParams.get('activo');
  const activo = activoQ === 'true' ? true : activoQ === 'false' ? false : activoPorDefecto;

  let data: User[] = [...getStore().usuarios].sort((a, b) => a.id.localeCompare(b.id)).map(toUser);
  if (roles.length > 0) data = data.filter((u) => roles.includes(u.rol));
  // Sin línea = transversal (jefe, supervisores, calidad): aparece en toda línea.
  if (lineaId) data = data.filter((u) => !u.lineaId || u.lineaId === lineaId);
  if (activo !== undefined) data = data.filter((u) => u.activo === activo);
  return data;
}

/** 422 `BUSINESS_RULE`: la planta no puede quedarse sin ningún jefe activo. */
function sinOtroJefeActivo(id: string, campo: 'rol' | 'activo'): Response | null {
  const otros = getStore().usuarios.filter((u) => u.rol === 'jefe' && u.activo && u.id !== id);
  if (otros.length > 0) return null;
  const mensaje = 'Debe quedar al menos un jefe de producción activo';
  return error(422, 'BUSINESS_RULE', mensaje, { [campo]: mensaje });
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
   * Directorio de personas. Lo consumen Configuración → Usuarios (jefe) y los
   * selectores de captura (otros roles). Igual que la API: sólo el jefe recibe
   * la ficha completa y todos los estados; el resto, la vista reducida y, si no
   * pide `activo`, sólo las personas activas.
   */
  http.get(`${API}/usuarios`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const esJefe = usuarioDesdeToken(request)?.rol === 'jefe';
    const filas = listarUsuarios(url, esJefe ? undefined : true);
    return HttpResponse.json({ data: esJefe ? filas : filas.map(aDirectorio) });
  }),

  /** Directorio reducido (sin DNI, correo ni último acceso); activos por defecto. */
  http.get(`${API}/usuarios/directorio`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    return HttpResponse.json({ data: listarUsuarios(url, true).map(aDirectorio) });
  }),

  http.post(`${API}/usuarios`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const prohibido = exigeRol(request, 'jefe');
    if (prohibido) return prohibido;
    const body = (await request.json()) as Record<string, unknown>;

    const detalles = validarAlta(body);
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    /* El correo se guarda siempre en minúsculas (el login ya lo compara normalizado). */
    const email = texto(body.email).trim().toLowerCase();
    const dni = texto(body.dni);
    const conflicto = duplicado(email, dni);
    if (conflicto) return conflicto;
    if (maquinistaSinLinea(texto(body.rol), body.lineaId as string | null | undefined)) {
      return errores.validacion({ lineaId: MENSAJE_MAQUINISTA_SIN_LINEA });
    }

    const nombre = texto(body.nombre).trim();
    const nuevo: UsuarioSeed = {
      id: `USR-${String(store.usuarios.length + 1).padStart(2, '0')}`,
      nombre,
      email,
      dni,
      rol: texto(body.rol) as Role,
      cargo: texto(body.cargo).trim(),
      lineaId: (body.lineaId as string | null | undefined) || null,
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
    const prohibido = exigeRol(request, 'jefe');
    if (prohibido) return prohibido;
    const usuario = store.usuarios.find((u) => u.id === params.id);
    if (!usuario) return errores.noEncontrado('Usuario');
    const body = (await request.json()) as Partial<User> & { password?: string };
    const detalles = validarCampos(body as Record<string, unknown>, true);
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);
    if (typeof body.email === 'string') body.email = body.email.trim().toLowerCase();
    if (typeof body.nombre === 'string') body.nombre = body.nombre.trim();
    if (typeof body.cargo === 'string') body.cargo = body.cargo.trim();

    const conflicto = duplicado(
      body.email && body.email !== usuario.email ? body.email : undefined,
      body.dni && body.dni !== usuario.dni ? body.dni : undefined,
      usuario.id
    );
    if (conflicto) return conflicto;
    if (
      maquinistaSinLinea(
        body.rol ?? usuario.rol,
        body.lineaId !== undefined ? body.lineaId : usuario.lineaId
      )
    ) {
      return errores.validacion({ lineaId: MENSAJE_MAQUINISTA_SIN_LINEA });
    }
    const pierdeJefatura = usuario.rol === 'jefe' && body.rol !== undefined && body.rol !== 'jefe';
    if (pierdeJefatura && usuario.id === usuarioDesdeToken(request)?.id) {
      return error(422, 'BUSINESS_RULE', 'No puedes quitarte el rol de jefe de producción', {
        rol: 'No puedes quitarte el rol de jefe de producción',
      });
    }
    if (pierdeJefatura) {
      const sinJefe = sinOtroJefeActivo(usuario.id, 'rol');
      if (sinJefe) return sinJefe;
    }

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
    const prohibido = exigeRol(request, 'jefe');
    if (prohibido) return prohibido;
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
    if (!body.activo && usuario.rol === 'jefe' && usuario.activo) {
      const sinJefe = sinOtroJefeActivo(usuario.id, 'activo');
      if (sinJefe) return sinJefe;
    }
    usuario.activo = body.activo;
    return HttpResponse.json(toUser(usuario));
  }),

  http.post(`${API}/usuarios/:id/restablecer-password`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe');
    if (prohibido) return prohibido;
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
