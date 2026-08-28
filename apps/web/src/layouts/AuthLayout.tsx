import { Icon } from '@mes/ui';

const BULLETS = [
  'Registro de producción en segundos',
  'Indicadores OEE por línea y turno',
  'Alertas tempranas con analítica IA',
] as const;

/**
 * Layout de autenticación — `Auth / Login` (Figma 2163:17066): 1440×960 en dos
 * mitades de 720. Panel de marca `background/subtle` con padding 80/88, columna
 * centrada `gap 24` y un spacer de 16 antes de los bullets; panel de formulario
 * blanco con el contenido centrado a 400 y `gap 20`. Por debajo de `lg` el panel
 * de marca se oculta y queda solo el formulario.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full bg-background-main">
      <aside className="hidden w-1/2 max-w-[720px] flex-col justify-center gap-6 bg-background-subtle px-22 py-20 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Icon name="ice-cream" size={24} />
          </span>
          <span className="text-h4 text-text-primary">Yamboly</span>
        </div>
        <h1 className="text-h1 text-text-primary">MES Yamboly</h1>
        <p className="max-w-[460px] text-body-lg text-text-secondary">
          Control y monitoreo de la producción en tiempo real
        </p>
        {/* Spacer 16 del frame: 24 (gap) + 16 + 24 (gap) = 64 hasta los bullets. */}
        <ul className="mt-10 flex flex-col gap-4">
          {BULLETS.map((texto) => (
            <li key={texto} className="flex items-center gap-3 text-body text-neutral-text">
              <Icon name="check-circle" size={20} className="shrink-0 text-text-secondary" />
              {texto}
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex min-w-0 flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-100 flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
