import { Icon } from '@mes/ui';

/**
 * Layout público sin sesión — `Evidencia / Encuesta pública / 1024`
 * (Figma 2163:15979): contenido centrado a 1024, cabecera con el logo y sin
 * navegación.
 */
export function PublicLayout({
  children,
  headerAside,
}: {
  children: React.ReactNode;
  /** ADITIVO (V5): texto de contexto a la derecha de la cabecera (2163:15979). */
  headerAside?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background-main">
      <header className="border-b border-divider">
        <div className="mx-auto flex w-full max-w-[1024px] items-center gap-2.5 px-8 py-4">
          <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
            <Icon name="ice-cream" size={16} />
          </span>
          <span className="text-body-md font-semibold text-text-primary">Yamboly MES</span>
          {headerAside && (
            <span className="ml-auto text-body-sm text-text-secondary">{headerAside}</span>
          )}
        </div>
      </header>
      {/* Columna de lectura de 720 px centrada (Figma 2163:15979): la cabecera
          ocupa el ancho completo, el formulario no. */}
      <main className="mx-auto flex w-full max-w-[784px] flex-1 flex-col gap-6 px-8 pt-7 pb-10">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-[1024px] px-8 pb-8 text-body-sm text-text-disabled">
        Helatony&apos;s S.A.C. · MES Yamboly
      </footer>
    </div>
  );
}
