import type { Role } from './common';

/**
 * Matriz de permisos de la captura en planta (paradas, mermas, velocidades,
 * detecciones IoT y fotos de evidencia). La comparten la API (`@Roles` +
 * `assertAccesoLinea`) y la web (botones visibles en Tiempo real).
 *
 * | Acción                               | jefe | supervisor | maquinista      | mermas | calidad | investigador |
 * | ------------------------------------ | ---- | ---------- | --------------- | ------ | ------- | ------------ |
 * | Parada: registrar / editar / cerrar  | sí   | sí         | solo su línea   | no     | no      | no           |
 * | Detección IoT: confirmar / descartar | sí   | sí         | solo su línea   | no     | no      | no           |
 * | Velocidad: registrar                 | sí   | sí         | solo su línea   | no     | no      | no           |
 * | Merma: registrar / editar            | sí   | sí         | solo su línea   | sí     | sí      | no           |
 * | Subir foto de evidencia              | sí   | sí         | sí              | sí     | sí      | no           |
 * | Lectura (listados)                   | sí   | sí         | sí              | sí     | sí      | sí           |
 *
 * Además, sobre una orden `por_validar` solo jefe y supervisor pueden añadir o
 * corregir registros, y sobre una orden `validada` nadie (409).
 */
export const ROLES_CAPTURA_PARADA: readonly Role[] = ['jefe', 'supervisor', 'maquinista'];
export const ROLES_CAPTURA_VELOCIDAD: readonly Role[] = ['jefe', 'supervisor', 'maquinista'];
export const ROLES_CAPTURA_MERMA: readonly Role[] = [
  'jefe',
  'supervisor',
  'maquinista',
  'mermas',
  'calidad',
];
export const ROLES_SUBIR_EVIDENCIA: readonly Role[] = [
  'jefe',
  'supervisor',
  'maquinista',
  'mermas',
  'calidad',
];
/** Roles que pueden corregir registros de una orden finalizada pendiente de validar. */
export const ROLES_CORRIGEN_ORDEN_CERRADA: readonly Role[] = ['jefe', 'supervisor'];

export type AccionCaptura = 'parada' | 'velocidad' | 'merma';

const ROLES_POR_ACCION: Record<AccionCaptura, readonly Role[]> = {
  parada: ROLES_CAPTURA_PARADA,
  velocidad: ROLES_CAPTURA_VELOCIDAD,
  merma: ROLES_CAPTURA_MERMA,
};

/**
 * `true` si el usuario puede capturar `accion` en `lineaId`: el rol debe estar
 * en la matriz y, si es maquinista, la línea debe ser la suya.
 */
export function puedeCapturar(
  usuario: { rol: Role; lineaId?: string | null } | null | undefined,
  accion: AccionCaptura,
  lineaId: string,
): boolean {
  if (!usuario || !ROLES_POR_ACCION[accion].includes(usuario.rol)) return false;
  if (usuario.rol === 'maquinista') return Boolean(usuario.lineaId) && usuario.lineaId === lineaId;
  return true;
}
