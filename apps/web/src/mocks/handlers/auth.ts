import { http, HttpResponse } from 'msw';
import type { EstadoOrden, LoginResponse, Role, User } from '@mes/types';
import { ROLES_CORRIGEN_ORDEN_CERRADA } from '@mes/types';
import { getStore, toUser } from '../store';
import { API, ahoraIso, error, errores, normalizar, preludio } from './_utils';

/** Token del mock: `mock.<userId>`. Un usuario desactivado deja de valer. */
export function usuarioDesdeToken(request: Request): User | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const id = auth.slice(7).replace('mock.', '');
  const encontrado = getStore().usuarios.find((u) => u.id === id);
  return encontrado?.activo ? toUser(encontrado) : null;
}

/**
 * Espejo de `@Roles` en la API: 403 si el usuario del token no está en la lista.
 * Devuelve `null` cuando el handler puede continuar.
 */
export function exigeRol(request: Request, ...roles: Role[]): Response | null {
  const usuario = usuarioDesdeToken(request);
  if (!usuario) return errores.noAutorizado();
  return roles.includes(usuario.rol) ? null : errores.prohibido();
}

/** Usuario con rol y línea: lo mínimo que miran las reglas de acceso. */
type UsuarioAcceso = Pick<User, 'rol' | 'lineaId'>;

/** 403 con el mensaje en español de la API (`ForbiddenException`). */
export function prohibido(mensaje = 'No tienes permisos para esta acción'): Response {
  return error(403, 'FORBIDDEN', mensaje);
}

/**
 * Espejo de `@Roles(...lista)` con las matrices de `@mes/types`
 * (`ROLES_CAPTURA_*`, `ROLES_ATENDER_ALERTA`…). Devuelve el usuario del token
 * o la respuesta 401/403 con la que cortar el handler.
 */
export function exigeRoles(
  request: Request,
  roles: readonly Role[]
): { usuario: User; respuesta?: undefined } | { usuario?: undefined; respuesta: Response } {
  const usuario = usuarioDesdeToken(request);
  if (!usuario) return { respuesta: errores.noAutorizado() };
  if (!roles.includes(usuario.rol)) return { respuesta: errores.prohibido() };
  return { usuario };
}

/**
 * Espejo de `assertAccesoLinea`: el maquinista sólo opera en su línea (403);
 * el resto de roles no está atado a una línea.
 */
export function accesoLinea(usuario: UsuarioAcceso, lineaId: string): Response | null {
  if (usuario.rol !== 'maquinista') return null;
  if (!usuario.lineaId || usuario.lineaId !== lineaId) {
    return prohibido('Solo puedes registrar en tu línea asignada');
  }
  return null;
}

/**
 * Espejo de `assertCapturaEnOrden`: reglas para registrar o corregir paradas,
 * mermas y velocidades de una orden.
 *
 * - `validada` → 409 (no admite cambios).
 * - finalizada pendiente de validar → sólo jefe y supervisor (403).
 * - la línea enviada debe ser la de la orden → 422 `lineaId`.
 * - el maquinista sólo en su línea → 403.
 */
export function capturaEnOrden(
  orden: { id: string; lineaId: string; estado: EstadoOrden },
  usuario: UsuarioAcceso,
  lineaId?: string
): Response | null {
  if (orden.estado === 'validada') {
    return errores.conflicto('La orden ya está validada: no admite registros ni correcciones', {
      ordenId: orden.id,
      estado: orden.estado,
    });
  }
  if (orden.estado !== 'en_curso' && !ROLES_CORRIGEN_ORDEN_CERRADA.includes(usuario.rol)) {
    return prohibido(
      'La orden ya fue finalizada: solo un supervisor o el jefe pueden añadir o corregir registros'
    );
  }
  if (lineaId !== undefined && lineaId !== '' && lineaId !== orden.lineaId) {
    return errores.validacion({ lineaId: 'La línea no coincide con la de la orden de fabricación' });
  }
  return accesoLinea(usuario, orden.lineaId);
}

/* ------------------------------------------------------------------ */
/* Límite de intentos de login (espejo de `LoginLimiter`)              */
/* ------------------------------------------------------------------ */

/** Mismos valores por defecto que `opcionesDesdeEntorno` de la API. */
const LOGIN_MAX_INTENTOS_CUENTA = 5;
const LOGIN_MAX_INTENTOS_IP = 20;
const LOGIN_BLOQUEO_MIN = 15;

interface ContadorLogin {
  fallos: number;
  desde: number;
  bloqueadoHasta: number;
}

/** Por cuenta (id o identificador tecleado) y, como el navegador es una sola IP, un contador global. */
const fallosPorCuenta = new Map<string, ContadorLogin>();
let fallosIp: ContadorLogin | undefined;

function sumarFallo(c: ContadorLogin | undefined, maximo: number): ContadorLogin {
  const ahora = Date.now();
  const ventanaMs = LOGIN_BLOQUEO_MIN * 60_000;
  const reiniciar =
    !c ||
    (c.bloqueadoHasta > 0 && c.bloqueadoHasta <= ahora) ||
    (c.bloqueadoHasta === 0 && ahora - c.desde > ventanaMs);
  const contador = reiniciar ? { fallos: 0, desde: ahora, bloqueadoHasta: 0 } : c;
  contador.fallos += 1;
  if (contador.fallos >= maximo) contador.bloqueadoHasta = ahora + ventanaMs;
  return contador;
}

/** 429 `TOO_MANY_REQUESTS` con `details.reintentarEnSeg` si la cuenta o la «IP» están bloqueadas. */
function bloqueoLogin(cuenta: string): Response | null {
  const ahora = Date.now();
  const bloqueos = [fallosIp, fallosPorCuenta.get(cuenta)]
    .map((c) => c?.bloqueadoHasta ?? 0)
    .filter((hasta) => hasta > ahora);
  if (bloqueos.length === 0) return null;
  const segundos = Math.ceil((Math.max(...bloqueos) - ahora) / 1000);
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return error(
    429,
    'TOO_MANY_REQUESTS',
    `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutos} min o contacta a Sistemas.`,
    { reintentarEnSeg: segundos }
  );
}

/** Vuelve a cero los contadores de login (útil en pruebas). */
export function reiniciarLimiteLogin(): void {
  fallosPorCuenta.clear();
  fallosIp = undefined;
}

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;

    const body = (await request.json()) as { email?: string; password?: string };
    const identificador = normalizar(body.email ?? '');
    const usuario = getStore().usuarios.find(
      (u) => normalizar(u.email) === identificador || u.dni === body.email?.trim()
    );

    /* Clave de cuenta como la API: el id si existe; si no, el identificador
     * tecleado (un correo inexistente se bloquea igual y no delata si existe). */
    const cuenta = usuario?.id ?? `?${identificador}`;
    const bloqueado = bloqueoLogin(cuenta);
    if (bloqueado) return bloqueado;

    /* Igual que `auth.service.ts`: un usuario inactivo no inicia sesión. */
    if (!usuario || !usuario.activo || usuario.password !== body.password) {
      fallosIp = sumarFallo(fallosIp, LOGIN_MAX_INTENTOS_IP);
      fallosPorCuenta.set(cuenta, sumarFallo(fallosPorCuenta.get(cuenta), LOGIN_MAX_INTENTOS_CUENTA));
      return errores.noAutorizado();
    }
    fallosPorCuenta.delete(cuenta);

    /* Se sella el acceso igual que hace el backend, para `/perfil`. */
    usuario.ultimoAcceso = ahoraIso();
    const respuesta: LoginResponse = {
      accessToken: `mock.${usuario.id}`,
      user: toUser(usuario),
    };
    return HttpResponse.json(respuesta);
  }),

  http.get(`${API}/auth/me`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const usuario = usuarioDesdeToken(request);
    if (!usuario) return errores.noAutorizado();
    return HttpResponse.json(usuario);
  }),

  http.post(`${API}/auth/logout`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return new HttpResponse(null, { status: 204 });
  }),
];
