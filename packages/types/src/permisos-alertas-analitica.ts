import type { Role } from './common';

/**
 * Matriz de permisos de Alertas y Analítica IA. La comparten la API (`@Roles`
 * + `assertAccesoLinea`) y la web (acciones visibles).
 *
 * | Acción                                     | jefe | supervisor | investigador | maquinista    | mermas | calidad |
 * | ------------------------------------------ | ---- | ---------- | ------------ | ------------- | ------ | ------- |
 * | Alertas: ver bandeja, campana y detalle    | sí   | sí         | sí           | sí            | sí     | sí      |
 * | Alerta: atender / descartar                | sí   | sí         | no           | solo su línea | no     | no      |
 * | Alerta: confirmar evento real (KPI EP)     | sí   | sí         | no           | no            | no     | no      |
 * | Umbrales: editar                           | sí   | sí         | no           | no            | no     | no      |
 * | Analítica: ver resumen/patrones/predicción | sí   | sí         | sí           | no            | no     | no      |
 * | Analítica: reentrenar / activar versión    | sí   | no         | sí           | no            | no     | no      |
 * | Analítica: diagnóstico del modelo          | sí   | no         | sí           | no            | no     | no      |
 * | Analítica: exportar dataset                | no   | no         | sí           | no            | no     | no      |
 *
 * Confirmar el evento real alimenta el Anexo 06 (EP) de la tesis: lo hacen
 * quienes supervisan la planta (jefe y supervisor), no quien la opera.
 */
export const ROLES_ATENDER_ALERTA: readonly Role[] = ['jefe', 'supervisor', 'maquinista'];
export const ROLES_CONFIRMAR_EP: readonly Role[] = ['jefe', 'supervisor'];
/** `PUT /alertas/umbrales` y botón «Configurar umbrales». */
export const ROLES_EDITAR_UMBRALES: readonly Role[] = ['jefe', 'supervisor'];
export const ROLES_VER_ANALITICA: readonly Role[] = ['jefe', 'supervisor', 'investigador'];
export const ROLES_GESTIONAR_MODELO: readonly Role[] = ['jefe', 'investigador'];

/** `true` si el rol puede atender/descartar una alerta de `lineaId`. */
export function puedeAtenderAlerta(
  usuario: { rol: Role; lineaId?: string | null } | null | undefined,
  lineaId: string,
): boolean {
  if (!usuario || !ROLES_ATENDER_ALERTA.includes(usuario.rol)) return false;
  return usuario.rol !== 'maquinista' || (!!usuario.lineaId && usuario.lineaId === lineaId);
}
