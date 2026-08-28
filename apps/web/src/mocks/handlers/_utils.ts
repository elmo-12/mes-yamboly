import { HttpResponse, delay } from 'msw';
import type { ApiError, Paginated } from '@mes/types';

/** Prefijo con comodín para que los handlers respondan tanto a URL absolutas como relativas. */
export const API = '*/api/v1';

/** Latencia simulada 150–400 ms, determinista por longitud de la ruta. */
export async function latencia(pathname = ''): Promise<void> {
  const base = 150 + (pathname.length * 37) % 251;
  await delay(base);
}

export function error(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
  const body: ApiError = { statusCode, code, message, details };
  return HttpResponse.json(body, { status: statusCode });
}

export const errores = {
  noAutorizado: () => error(401, 'UNAUTHORIZED', 'Credenciales inválidas o sesión expirada'),
  prohibido: () => error(403, 'FORBIDDEN', 'No tienes permisos para esta acción'),
  noEncontrado: (recurso: string) => error(404, 'NOT_FOUND', `${recurso} no encontrado`),
  conflicto: (message: string, details?: Record<string, unknown>) => error(409, 'CONFLICT', message, details),
  validacion: (details: Record<string, unknown>) =>
    error(422, 'VALIDATION_ERROR', 'Revisa los campos del formulario', details),
  interno: () => error(500, 'INTERNAL_ERROR', 'Error interno del servidor mock'),
};

/**
 * Errores simulables desde la UI o desde las pruebas:
 * `?__error=500` en la query o cabecera `x-mock-error: 500`.
 */
export function errorSimulado(request: Request): Response | null {
  const url = new URL(request.url);
  const codigo = url.searchParams.get('__error') ?? request.headers.get('x-mock-error');
  if (!codigo) return null;
  switch (codigo) {
    case '401':
      return errores.noAutorizado();
    case '403':
      return errores.prohibido();
    case '404':
      return errores.noEncontrado('Recurso');
    case '409':
      return errores.conflicto('Conflicto simulado');
    case '422':
      return errores.validacion({ campo: 'Valor simulado inválido' });
    case 'empty':
      return HttpResponse.json({ data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
    default:
      return errores.interno();
  }
}

/** Envoltura común: latencia + error simulable. Devuelve `null` si debe continuar. */
export async function preludio(request: Request): Promise<Response | null> {
  await latencia(new URL(request.url).pathname);
  return errorSimulado(request);
}

export function paginar<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const total = items.length;
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const desde = (page - 1) * pageSize;
  return {
    data: items.slice(desde, desde + pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}

export function numeroQuery(url: URL, clave: string, porDefecto: number): number {
  const valor = Number(url.searchParams.get(clave));
  return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
}

/** Lee un filtro que puede venir repetido (`?lineaId=L1&lineaId=L2`) o separado por comas. */
export function listaQuery(url: URL, clave: string): string[] {
  const repetidos = url.searchParams.getAll(clave);
  if (repetidos.length === 0) return [];
  return repetidos.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** ISO local `YYYY-MM-DDTHH:mm:ss` del instante actual. */
export function ahoraIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function hoyIso(): string {
  return ahoraIso().slice(0, 10);
}
