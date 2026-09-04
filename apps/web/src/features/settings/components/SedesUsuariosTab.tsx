'use client';

import { SedesSection } from './SedesSection';
import { UsuariosSection } from './UsuariosSection';

/**
 * Pestaña "Sedes y usuarios": mantenedor de las 9 plantas y del directorio de
 * personas (alta, edición, contraseña y activación). Cada sección trae su
 * propio estado de carga, error y vacío; el único `Button variant="primary"` de
 * la pestaña es «Nuevo usuario» (el alta de sede es secundaria).
 */
export function SedesUsuariosTab() {
  return (
    <div className="flex flex-col gap-8">
      <SedesSection />
      <UsuariosSection />
    </div>
  );
}
