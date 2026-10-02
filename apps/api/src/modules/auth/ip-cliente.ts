import { isIP } from 'node:net';
import type { Request } from 'express';

/**
 * IP del cliente para el límite de login, o `null` si no es fiable.
 *
 * Se apoya en `req.ip` de Express, que con `trust proxy` = N (`TRUST_PROXY_HOPS`)
 * toma el salto N desde la derecha de `X-Forwarded-For` y descarta lo que el
 * cliente haya antepuesto. No es fiable cuando hay saltos de confianza
 * configurados pero la petición llega sin `X-Forwarded-For` (entonces `req.ip`
 * sería la IP del propio proxy y todos los usuarios compartirían contador).
 */
export function ipCliente(req: Request): string | null {
  /* El ajuste real de Express (número de saltos, `true`, lista…): cualquier valor
   * distinto de 0/false/'' significa que hay un proxy de confianza delante. */
  const confianza: unknown = req.app.get('trust proxy');
  if (confianza && confianza !== 0 && req.ips.length === 0) return null;
  const ip = req.ip;
  return ip && isIP(ip) ? ip : null;
}
