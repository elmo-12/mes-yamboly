import { http, HttpResponse } from 'msw';
import type { LoginResponse, User } from '@mes/types';
import { toUser, usuarios } from '../data';
import { API, ahoraIso, errores, normalizar, preludio } from './_utils';

/** Token del mock: `mock.<userId>`. */
export function usuarioDesdeToken(request: Request): User | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const id = auth.slice(7).replace('mock.', '');
  const encontrado = usuarios.find((u) => u.id === id);
  return encontrado ? toUser(encontrado) : null;
}

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;

    const body = (await request.json()) as { email?: string; password?: string };
    const identificador = normalizar(body.email ?? '');
    const usuario = usuarios.find(
      (u) => normalizar(u.email) === identificador || u.dni === body.email?.trim()
    );

    if (!usuario || usuario.password !== body.password) {
      return errores.noAutorizado();
    }

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
