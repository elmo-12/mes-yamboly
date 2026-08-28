'use client';

import * as React from 'react';

/**
 * Layout de Modo TV — `Tiempo real / Modo TV` (Figma 2163:8523): pantalla de
 * planta sin shell, fondo `tv/background`, padding 40, gap 24 y reloj a la
 * derecha. Solo lectura: no lleva navegación ni acciones.
 */
export function TvLayout({
  titulo = 'Tiempo real de planta',
  subtitulo,
  notaReloj,
  children,
}: {
  titulo?: string;
  subtitulo?: string;
  /** Línea bajo el reloj: "Actualizado hace 3 s · solo lectura". */
  notaReloj?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col gap-6 bg-tv-background p-10 text-tv-text">
      <header className="flex items-center gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-display text-tv-text">{titulo}</h1>
          {subtitulo && <p className="text-tv-lead text-tv-text-muted">{subtitulo}</p>}
        </div>
        <div className="flex-1" />
        <Reloj nota={notaReloj} />
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}

/** Reloj de planta: hora local de Lima, refresco cada segundo. */
function Reloj({ nota }: { nota?: string }) {
  const [hora, setHora] = React.useState<string | null>(null);

  React.useEffect(() => {
    const formato = new Intl.DateTimeFormat('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'America/Lima',
    });
    const tick = () => setHora(formato.format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <time className="text-tv-clock tabular text-tv-text" suppressHydrationWarning>
        {hora ?? '--:--:--'}
      </time>
      {nota && <span className="text-tv-note text-tv-text-muted">{nota}</span>}
    </div>
  );
}
