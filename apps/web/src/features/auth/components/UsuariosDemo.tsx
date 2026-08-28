import { Divider } from '@mes/ui';

/** Cuentas del entorno de demostración (mocks msw). No forma parte del frame de Figma. */
const CUENTAS = [
  { correo: 'jefe@yamboly.lat', rol: 'Jefe de producción' },
  { correo: 'jorge.quispe@yamboly.lat', rol: 'Maquinista L2' },
  { correo: 'ana.rios@yamboly.lat', rol: 'Supervisora' },
  { correo: 'maria.torres@yamboly.lat', rol: 'Encargada de merma' },
  { correo: 'investigador@yamboly.lat', rol: 'Investigador' },
] as const;

/**
 * Bloque de apoyo para la demo de tesis: lista discreta de usuarios de prueba.
 * Añadido fuera del diseño de Figma; se retira al conectar el backend real.
 */
export function UsuariosDemo() {
  return (
    <section className="flex w-full flex-col gap-2.5">
      <Divider />
      <p className="text-overline text-text-disabled uppercase">Usuarios de demostración</p>
      <ul className="flex flex-col gap-1">
        {CUENTAS.map((cuenta) => (
          <li key={cuenta.correo} className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="truncate text-text-secondary">{cuenta.correo}</span>
            <span className="shrink-0 text-text-disabled">{cuenta.rol}</span>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-text-disabled">
        Contraseña para todas: <span className="tabular text-text-secondary">Yamboly2026</span>
      </p>
    </section>
  );
}
