'use client';

import * as React from 'react';
import { Badge, TBody, TCell, TH, THead, TRow, Table, type BadgeColor } from '@mes/ui';
import type { ComparativaTurno } from '@mes/types';
import { formatDelta, formatPct } from '@mes/shared';

export interface ComparativaTurnoTableProps {
  turnos: readonly ComparativaTurno[];
  /** Texto de la fila de total (`Total periodo`). */
  totalLabel?: string;
}

function colorDelta(delta: number): BadgeColor {
  if (delta > 0) return 'success';
  if (delta < 0) return 'critical';
  return 'neutral';
}

function media(valores: readonly number[]): number {
  return valores.length === 0 ? 0 : valores.reduce((a, v) => a + v, 0) / valores.length;
}

/**
 * `Table / Comparativa por turno` (Figma 2165:12881) — tabla integrada sin
 * card: cabecera 40, filas 44, Δ como Badge y fila de total sobre
 * `background/subtle`.
 */
export function ComparativaTurnoTable({ turnos, totalLabel = 'Total periodo' }: ComparativaTurnoTableProps) {
  const totales = {
    oee: media(turnos.map((t) => t.oee)),
    disponibilidad: media(turnos.map((t) => t.disponibilidad)),
    desempeno: media(turnos.map((t) => t.desempeno)),
    calidad: media(turnos.map((t) => t.calidad)),
    deltaOee: media(turnos.map((t) => t.deltaOee)),
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-h4 text-text-primary">Comparativa por turno</h3>
        <p className="text-body-sm text-text-secondary">Δ calculado contra el periodo comparado</p>
      </div>
      <Table density="dense">
        <THead>
          <TRow plain>
            <TH>Turno</TH>
            <TH numeric>OEE</TH>
            <TH numeric>Disp.</TH>
            <TH numeric>Desemp.</TH>
            <TH numeric>Cal.</TH>
            <TH numeric>Δ vs ant.</TH>
          </TRow>
        </THead>
        <TBody>
          {turnos.map((t) => (
            <TRow key={t.turno}>
              <TCell className="font-medium">{t.turnoLabel}</TCell>
              <TCell numeric className="font-semibold">
                {formatPct(t.oee)}
              </TCell>
              <TCell numeric muted>
                {formatPct(t.disponibilidad)}
              </TCell>
              <TCell numeric muted>
                {formatPct(t.desempeno)}
              </TCell>
              <TCell numeric muted>
                {formatPct(t.calidad)}
              </TCell>
              <TCell numeric>
                <Badge color={colorDelta(t.deltaOee)}>{formatDelta(t.deltaOee)}</Badge>
              </TCell>
            </TRow>
          ))}
          <TRow plain className="bg-background-subtle">
            <TCell className="font-semibold">{totalLabel}</TCell>
            <TCell numeric className="font-semibold">
              {formatPct(totales.oee)}
            </TCell>
            <TCell numeric>{formatPct(totales.disponibilidad)}</TCell>
            <TCell numeric>{formatPct(totales.desempeno)}</TCell>
            <TCell numeric>{formatPct(totales.calidad)}</TCell>
            <TCell numeric>
              <Badge color={colorDelta(totales.deltaOee)}>{formatDelta(totales.deltaOee)}</Badge>
            </TCell>
          </TRow>
        </TBody>
      </Table>
    </div>
  );
}
