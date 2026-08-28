'use client';

import * as React from 'react';
import { Skeleton, cn } from '@mes/ui';
import type { EstadoLinea, TvRow } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { TvLayout } from '@/layouts/TvLayout';
import { useModoTv } from '../hooks';

/** Paleta del Modo TV por estado (tokens `--color-tv-*` de theme.css). */
const TONO: Record<EstadoLinea, { pill: string; texto: string; barra: string }> = {
  produciendo: { pill: 'bg-tv-ok-subtle', texto: 'text-tv-ok-text', barra: 'bg-tv-ok' },
  alerta: { pill: 'bg-tv-warn-subtle', texto: 'text-tv-warn-text', barra: 'bg-tv-warn' },
  sugerida: { pill: 'bg-tv-iot-subtle', texto: 'text-tv-iot-text', barra: 'bg-tv-iot' },
  parada: { pill: 'bg-tv-stop-subtle', texto: 'text-tv-stop-text', barra: 'bg-tv-stop' },
  sin_orden: { pill: 'bg-tv-idle-subtle', texto: 'text-tv-idle-text', barra: 'bg-tv-idle' },
};

const LEYENDA: { estado: EstadoLinea; label: string }[] = [
  { estado: 'produciendo', label: 'Produciendo' },
  { estado: 'alerta', label: 'Riesgo detectado por IA' },
  { estado: 'sugerida', label: 'Parada sugerida por sensor' },
  { estado: 'parada', label: 'Parada confirmada' },
  { estado: 'sin_orden', label: 'Sin orden' },
];

function etiquetaEstado(fila: TvRow): string {
  switch (fila.estado) {
    case 'alerta':
      return 'RIESGO DE PARADA';
    case 'sugerida':
      return 'PARADA DETECTADA';
    case 'parada':
      return `EN PARADA${fila.detalle ? ` · ${fila.detalle.split(' ')[0]}` : ''}`;
    case 'sin_orden':
      return 'SIN ORDEN';
    default:
      return 'PRODUCIENDO';
  }
}

/** `161` → `02 h 41 min` */
function formatHoras(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min`;
}

/**
 * `Tiempo real / Modo TV / 1920` (Figma 2163:8523): pantalla de planta de solo
 * lectura, filas a ancho completo y refresco automático cada 5 s.
 */
export function ModoTvPage() {
  const { data, isPending, isError } = useModoTv();
  const [ahora, setAhora] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const segundos = data
    ? Math.max(0, Math.round((ahora - new Date(data.actualizadoEn).getTime()) / 1000))
    : null;

  return (
    <TvLayout
      subtitulo={`Yamboly · Planta Lima${data ? ` · Turno ${data.turnoLabel} 06:00–14:00` : ''}`}
      notaReloj={
        segundos === null ? 'Conectando con la planta…' : `Actualizado hace ${segundos} s · solo lectura`
      }
    >
      {/* `min-h-0` + filas `flex-1`: con 5 o con 6 puestos el tablero sigue
          cabiendo en la pantalla de planta sin scroll (Figma 2163:8523). */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {isPending &&
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="max-h-[124px] w-full flex-1 rounded-lg bg-tv-surface" />
          ))}
        {isError && (
          <p className="text-tv-lead text-tv-stop-text">
            Sin conexión con la planta. El tablero reintenta automáticamente.
          </p>
        )}
        {data?.filas.map((fila) => (
          <FilaTv key={fila.lineaId} fila={fila} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-6">
        {LEYENDA.map((l) => (
          <div key={l.estado} className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-pill', TONO[l.estado].barra)} aria-hidden />
            <span className="text-tv-note text-tv-text-muted">{l.label}</span>
          </div>
        ))}
        <div className="flex-1" />
        <span className="text-tv-note text-tv-idle">
          Pantalla de planta · solo lectura · se actualiza cada 5 s
        </span>
      </div>
    </TvLayout>
  );
}

function FilaTv({ fila }: { fila: TvRow }) {
  const tono = TONO[fila.estado];
  const conOrden = fila.plan > 0;
  return (
    <article className="flex min-h-0 max-h-[124px] flex-1 items-center gap-4 overflow-hidden rounded-lg bg-tv-surface px-5 py-5 lg:gap-5 lg:px-6 xl:gap-6 2xl:gap-7 2xl:px-7">
      <div className="flex w-44 shrink-0 flex-col gap-1.5 lg:w-60 xl:w-[300px] 2xl:w-[380px]">
        <p className="truncate text-tv-metric text-tv-text xl:text-tv-line">
          {`${fila.lineaCodigo} · ${fila.lineaNombre}`}
        </p>
        <p className="truncate text-tv-note text-tv-text-muted">
          {fila.detalle ?? (conOrden ? 'Orden en curso' : 'Sin orden asignada')}
        </p>
      </div>

      <div className="w-[150px] shrink-0 lg:w-[220px] xl:w-[260px] 2xl:w-[300px]">
        <span
          className={cn(
            'inline-flex max-w-full items-center gap-2.5 rounded-pill px-4 py-2 2xl:px-[18px] 2xl:py-2.5',
            tono.pill,
          )}
        >
          <span className={cn('size-3 shrink-0 rounded-pill', tono.barra)} aria-hidden />
          <span className={cn('truncate text-body-md font-semibold xl:text-tv-state', tono.texto)}>
            {etiquetaEstado(fila)}
          </span>
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="truncate text-tv-value tabular whitespace-nowrap text-tv-text">
          {conOrden
            ? `${formatNumber(fila.producido)} / ${formatNumber(fila.plan)} u`
            : '— / — u'}
        </p>
        <div className="h-3 w-full overflow-hidden rounded-pill bg-tv-border">
          <div
            className={cn('h-full rounded-pill transition-[width] duration-500', tono.barra)}
            style={{ width: `${Math.min(100, Math.max(conOrden ? 1 : 0, fila.avancePct))}%` }}
          />
        </div>
        <p className="truncate text-tv-note text-tv-text-muted">
          {conOrden ? `${formatNumber(fila.avancePct, 0)} % del objetivo del turno` : 'línea disponible'}
        </p>
      </div>

      <div className="flex w-[110px] shrink-0 flex-col gap-1 lg:w-[150px] xl:w-[170px] 2xl:w-[190px]">
        <p className="truncate text-tv-metric tabular whitespace-nowrap text-tv-text">
          {conOrden ? `${formatNumber(fila.velocidad)} u/min` : '— u/min'}
        </p>
        <p className="truncate text-tv-sub text-tv-text-muted">
          {conOrden ? `objetivo ${formatNumber(fila.velocidadEstandar)}` : '—'}
        </p>
      </div>

      <div className="flex w-[130px] shrink-0 flex-col gap-1 lg:w-[180px] xl:w-[200px] 2xl:w-[210px]">
        <p className="truncate text-tv-metric tabular whitespace-nowrap text-tv-text">
          {formatHoras(fila.tiempoEnEstadoMin)}
        </p>
        <p className="truncate text-tv-sub text-tv-text-muted">
          {fila.estado === 'parada'
            ? 'en parada'
            : fila.estado === 'sugerida'
              ? 'pendiente de confirmar'
              : fila.estado === 'sin_orden'
                ? 'sin actividad'
                : 'en producción'}
        </p>
      </div>
    </article>
  );
}
