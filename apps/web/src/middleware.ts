import { NextResponse, type NextRequest } from 'next/server';

/**
 * IP real del cliente para el límite de login de la API.
 *
 * El proxy de `rewrites` reenvía `X-Forwarded-For` tal como lo manda el cliente
 * (falseable) y, si no viene, la API vería la IP del servidor Next (todos los
 * usuarios compartirían contador). Este middleware, solo para `/api/v1/*`,
 * sobrescribe la cabecera con un único valor de confianza:
 *
 * - `WEB_TRUST_PROXY_HOPS` = N proxies propios delante de Next (túnel, nginx…):
 *   la IP es la N-ésima desde la derecha de `X-Forwarded-For` (lo antepuesto por
 *   el cliente queda descartado).
 * - 0 (por defecto): Next 15 no expone la IP del socket al middleware, así que
 *   se elimina la cabecera. La API (`TRUST_PROXY_HOPS=1`) lo detecta como IP no
 *   fiable y limita solo por cuenta.
 */
export function middleware(request: NextRequest) {
  const saltos = Number(process.env.WEB_TRUST_PROXY_HOPS ?? 0);
  const cabecera = request.headers.get('x-forwarded-for') ?? '';
  const partes = cabecera.split(',').map((p) => p.trim()).filter(Boolean);
  const ip = Number.isInteger(saltos) && saltos > 0 ? partes[partes.length - saltos] : undefined;

  const headers = new Headers(request.headers);
  if (ip) headers.set('x-forwarded-for', ip);
  else headers.delete('x-forwarded-for');
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: '/api/v1/:path*' };
