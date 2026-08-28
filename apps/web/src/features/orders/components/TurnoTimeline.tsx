'use client';

import * as React from 'react';
import { Overline } from '@mes/ui';
import type { ParadaListItem } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { hora } from '../format';

type Tono = 'produccion' | 'planificada' | 'imprevista';

const TONO_CLASE: Record<Tono, string> = {
  produccion: 'bg-primary',
  planificada: 'bg-warning',
  imprevista: 'bg-error',
};

const TONO_LABEL: Record<Tono, string> = {
  produccion: 'Producción',
  planificada: 'Parada planificada',
  imprevista: 'Parada no planificada',
};

interface Segmento {
  tono: Tono;
  minutos: number;
  desde: number;
}

export interface TurnoTimelineProps {
  /** ISO-8601 de inicio y fin de la orden. */
  inicio: string;
  fin: string | null;
  paradas: readonly ParadaListItem[];
}

/**
 * Línea de tiempo horizontal del turno (Figma 2156:8959): barra segmentada
 * producción / paradas + eje de horas + leyenda. Va directamente sobre la
 * página, sin card (regla MDS: solo cards funcionales).
 */
export function TurnoTimeline({ inicio, fin, paradas }: TurnoTimelineProps) {
  const { segmentos, totalMin, etiquetas } = React.useMemo(() => {
    const t0 = new Date(inicio).getTime();
    const t1 = fin ? new Date(fin).getTime() : t0 + 8 * 3600_000;
    const total = Math.max(1, Math.round((t1 - t0) / 60_000));

    const intervalos = [...paradas]
      .filter((p) => p.fin)
      .map((p) => ({
        desde: Math.max(0, Math.round((new Date(p.inicio).getTime() - t0) / 60_000)),
        hasta: Math.min(total, Math.round((new Date(p.fin as string).getTime() - t0) / 60_000)),
        tono: (p.afectaOee ? 'imprevista' : 'planificada') as Tono,
      }))
      .filter((i) => i.hasta > i.desde)
      .sort((a, b) => a.desde - b.desde);

    const out: Segmento[] = [];
    let cursor = 0;
    for (const i of intervalos) {
      if (i.desde > cursor) {
        out.push({ tono: 'produccion', minutos: i.desde - cursor, desde: cursor });
      }
      out.push({ tono: i.tono, minutos: i.hasta - Math.max(cursor, i.desde), desde: i.desde });
      cursor = Math.max(cursor, i.hasta);
    }
    if (cursor < total) out.push({ tono: 'produccion', minutos: total - cursor, desde: cursor });

    /* Marcas de hora en punto dentro del turno. */
    const marcas: string[] = [];
    const primera = new Date(t0);
    primera.setMinutes(0, 0, 0);
    for (let t = primera.getTime(); t <= t1; t += 3600_000) {
      if (t >= t0) marcas.push(new Date(t).toTimeString().slice(0, 5));
    }

    return { segmentos: out, totalMin: total, etiquetas: marcas };
  }, [fin, inicio, paradas]);

  const porTono = (tono: Tono) =>
    segmentos.filter((s) => s.tono === tono).reduce((acc, s) => acc + s.minutos, 0);

  const leyenda: Tono[] = ['produccion', 'imprevista', 'planificada'];

  return (
    <section className="flex flex-1 flex-col gap-2.5" aria-label="Línea de tiempo del turno">
      <Overline>{`Línea de tiempo del turno · ${hora(inicio)} – ${fin ? hora(fin) : 'en curso'}`}</Overline>

      <div className="flex h-6 w-full overflow-hidden rounded-xs bg-divider" role="img" aria-label={leyendaTexto(porTono)}>
        {segmentos.map((s, i) => (
          <span
            key={`${s.tono}-${s.desde}-${i}`}
            title={`${TONO_LABEL[s.tono]} · ${s.minutos} min`}
            className={TONO_CLASE[s.tono]}
            style={{ width: `${(s.minutos / totalMin) * 100}%` }}
          />
        ))}
      </div>

      <div className="flex justify-between text-caption tabular text-text-disabled">
        {etiquetas.map((e) => (
          <span key={e}>{e}</span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {leyenda.map((tono) => (
          <span key={tono} className="flex items-center gap-1.5 text-body-sm text-text-secondary">
            <span className={`size-2 shrink-0 rounded-pill ${TONO_CLASE[tono]}`} aria-hidden />
            {`${TONO_LABEL[tono]} ${formatNumber(porTono(tono))} min`}
          </span>
        ))}
      </div>
    </section>
  );
}

function leyendaTexto(porTono: (t: Tono) => number): string {
  return `Producción ${porTono('produccion')} min, parada no planificada ${porTono('imprevista')} min, parada planificada ${porTono('planificada')} min`;
}
