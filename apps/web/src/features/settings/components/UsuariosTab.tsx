'use client';

import { UsuariosSection } from './UsuariosSection';

/**
 * Pestaña «Usuarios»: directorio de personas (alta, edición, contraseña y
 * activación). La aplicación opera una única sede (Lima), así que el
 * mantenedor de sedes desapareció y la pestaña se reduce al directorio.
 */
export function UsuariosTab() {
  return <UsuariosSection />;
}
