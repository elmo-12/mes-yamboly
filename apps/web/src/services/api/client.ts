import type { ApiError } from '@mes/types';
import { API_BASE_URL } from './data-source';

/** Query serializable: los arrays se envían repitiendo la clave. */
export type QueryParams = Record<
  string,
  string | number | boolean | undefined | null | (string | number)[]
>;

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.statusCode = error.statusCode;
    this.code = error.code;
    this.details = error.details;
  }
}

/** Lector del token de sesión; lo inyecta `session-store` para evitar un ciclo. */
let tokenGetter: () => string | null = () => null;

export function setTokenGetter(getter: () => string | null): void {
  tokenGetter = getter;
}

/** Token de la sesión actual; lo necesita `EventSource`, que no admite cabeceras. */
export function tokenActual(): string | null {
  return tokenGetter();
}

/** Callback invocado ante un 401 (limpia la sesión). */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export function buildUrl(path: string, params?: QueryParams): string {
  const base = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!params) return base;
  const search = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) {
      for (const item of valor) search.append(clave, String(item));
    } else {
      search.append(clave, String(valor));
    }
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

interface RequestOptions {
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const cuerpo = (await response.json()) as Partial<ApiError>;
    return {
      statusCode: cuerpo.statusCode ?? response.status,
      code: cuerpo.code ?? 'INTERNAL_ERROR',
      message: cuerpo.message ?? response.statusText ?? 'Error inesperado',
      details: cuerpo.details,
    };
  } catch {
    return {
      statusCode: response.status,
      code: 'INTERNAL_ERROR',
      message: response.statusText || 'No se pudo contactar con el servidor',
    };
  }
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const token = tokenGetter();
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(buildUrl(path, options.params), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await parseError(response);
    if (error.statusCode === 401) onUnauthorized?.();
    throw new ApiClientError(error);
  }

  if (response.status === 204) return undefined as T;
  const texto = await response.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

export const api = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) =>
    request<T>('GET', path, { params, signal }),
  post: <T>(path: string, body?: unknown, params?: QueryParams) =>
    request<T>('POST', path, { body, params }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  del: <T>(path: string, params?: QueryParams) => request<T>('DELETE', path, { params }),
};

/**
 * Descarga un archivo del API con la cabecera `Authorization` y lo entrega al
 * navegador. Un `<a download>` no puede llevar cabeceras, así que el binario se
 * pide con `fetch` y se guarda desde un blob.
 *
 * `path` acepta una ruta relativa al prefijo del API (`/reportes/…/descargar`)
 * o una URL absoluta.
 */
export async function descargarArchivo(path: string, nombreSugerido: string): Promise<void> {
  const token = tokenGetter();
  const url = /^https?:\/\//.test(path) ? path : buildUrl(path);
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new ApiClientError(await parseError(response));

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = objectUrl;
  enlace.download = nombreSugerido;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(objectUrl);
}
