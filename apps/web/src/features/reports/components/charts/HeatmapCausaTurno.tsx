'use client';

import * as React from 'react';
import { HeatmapCell, Overline } from '@mes/ui';
import type { HeatmapCelda } from '@mes/types';
import { formatNumber } from '@mes/shared';
import { ChartFrame, heatmapScale } from '@/components/charts';

export interface HeatmapCausaTurnoProps {
  celdas: readonly HeatmapCelda[];
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Sufijo de la magnitud (`kg`, `min`). */
  unidad?: string;
  bordered?: boolean;
  /** `codigo` muestra solo `MR-01`; `completa` añade el nombre de la causa. */
  etiquetaFila?: 'codigo' | 'completa';
}

/**
 * `Chart / Heatmap causa × turno` (Figma 2166:4402 y 2156:9713): rejilla CSS
 * con la columna de etiqueta + una celda por turno, escala de 5 pasos del MDS
 * (`HeatmapCell`) y leyenda Menor → Mayor con los mismos pasos.
 */
export function HeatmapCausaTurno({
  celdas,
  title = 'Merma por causa y turno',
  subtitle = 'Kilogramos · escala de intensidad',
  unidad = 'kg',
  bordered = true,
  etiquetaFila = 'completa',
}: HeatmapCausaTurnoProps) {
  const filas = React.useMemo(() => {
    const orden: string[] = [];
    const mapa = new Map<string, { label: string; celdas: HeatmapCelda[] }>();
    for (const c of celdas) {
      if (!mapa.has(c.fila)) {
        mapa.set(c.fila, { label: c.filaLabel, celdas: [] });
        orden.push(c.fila);
      }
      mapa.get(c.fila)!.celdas.push(c);
    }
    return orden.map((k) => ({ id: k, ...mapa.get(k)! }));
  }, [celdas]);

  const columnas = React.useMemo(() => {
    const vistas = new Map<string, string>();
    for (const c of celdas) if (!vistas.has(c.columna)) vistas.set(c.columna, c.columnaLabel);
    return [...vistas.entries()].map(([id, label]) => ({ id, label }));
  }, [celdas]);

  const max = celdas.reduce((m, c) => Math.max(m, c.valor), 0);
  const pico = celdas.reduce<HeatmapCelda | null>((p, c) => (p === null || c.valor > p.valor ? c : p), null);
  const anchoEtiqueta = etiquetaFila === 'codigo' ? 'minmax(64px, 0.7fr)' : 'minmax(160px, 1.4fr)';
  const alto = filas.length * 40 + 70;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      height={alto}
      bordered={bordered}
      className={bordered ? 'lg:max-w-[380px]' : undefined}
      footer={
        pico
          ? `Pico: ${pico.filaLabel} · ${pico.columnaLabel} (${formatNumber(pico.valor)} ${unidad})`
          : undefined
      }
    >
      <div className="flex h-full flex-col gap-1">
        <div
          className="grid items-center gap-1"
          style={{ gridTemplateColumns: `${anchoEtiqueta} repeat(${columnas.length}, minmax(0, 1fr))` }}
        >
          <span />
          {columnas.map((c) => (
            <Overline key={c.id} className="text-center">
              {c.label}
            </Overline>
          ))}
        </div>
        {filas.map((f) => (
          <div
            key={f.id}
            className="grid items-center gap-1"
            style={{ gridTemplateColumns: `${anchoEtiqueta} repeat(${columnas.length}, minmax(0, 1fr))` }}
          >
            <span className="truncate text-body-sm font-medium text-text-primary" title={f.label}>
              {etiquetaFila === 'codigo' ? f.id : f.label}
            </span>
            {columnas.map((c) => {
              const celda = f.celdas.find((x) => x.columna === c.id);
              return (
                <HeatmapCell
                  key={c.id}
                  value={celda?.valor ?? 0}
                  max={max}
                  label={`${f.label} · ${c.label}: ${formatNumber(celda?.valor ?? 0)} ${unidad}`}
                  className="h-9 rounded-sm"
                />
              );
            })}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="text-caption text-text-secondary">Menor</span>
          {heatmapScale.map((color, i) => (
            <span
              key={color}
              className="h-2.5 w-6 rounded-xs"
              style={{ backgroundColor: color }}
              aria-hidden
              title={`Paso ${i + 1} de ${heatmapScale.length}`}
            />
          ))}
          <span className="text-caption text-text-secondary">
            Mayor · máx. {formatNumber(max)} {unidad}
          </span>
        </div>
      </div>
    </ChartFrame>
  );
}
