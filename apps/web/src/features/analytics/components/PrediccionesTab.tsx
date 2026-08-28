'use client';

import * as React from 'react';
import {
  Badge,
  ProgressBar,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
} from '@mes/ui';
import type { Predicciones } from '@mes/types';
import { formatDate, formatPct } from '@mes/shared';
import { PredichoVsRealChart } from './charts/PredichoVsRealChart';

export interface PrediccionesTabProps {
  predicciones: Predicciones;
}

const ACIERTO = {
  si: { color: 'success' as const, label: 'Acierto' },
  no: { color: 'critical' as const, label: 'Fallo' },
  pendiente: { color: 'neutral' as const, label: 'Pendiente' },
};

/** `Analítica / Predicciones` (Figma 2156:4523). */
export function PrediccionesTab({ predicciones }: PrediccionesTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <PredichoVsRealChart serie={predicciones.serie} />

      <SectionTitle
        title="Histórico de predicciones evaluadas"
        description="Cada predicción se contrasta con el evento real registrado en planta (KPI EP)"
      />
      <Table density="dense">
        <THead>
          <TRow plain>
            <TH>Fecha</TH>
            <TH>Línea</TH>
            <TH>Evento predicho</TH>
            <TH>Probabilidad</TH>
            <TH>Resultado real</TH>
            <TH>Acierto</TH>
          </TRow>
        </THead>
        <TBody>
          {predicciones.historico.map((h) => {
            const estado = h.acierto === null ? ACIERTO.pendiente : h.acierto ? ACIERTO.si : ACIERTO.no;
            return (
              <TRow key={h.id}>
                <TCell muted className="tabular whitespace-nowrap">
                  {formatDate(h.fecha)}
                </TCell>
                <TCell className="font-medium">{h.lineaCodigo}</TCell>
                <TCell>{h.prediccion}</TCell>
                <TCell>
                  <span className="flex items-center gap-2">
                    <ProgressBar
                      value={h.probabilidad}
                      height={4}
                      tone={h.probabilidad >= 70 ? 'primary' : 'neutral'}
                      className="w-20"
                      label={`Probabilidad ${h.probabilidad} %`}
                    />
                    <span className="w-12 text-body-sm tabular text-text-secondary">
                      {formatPct(h.probabilidad, 0)}
                    </span>
                  </span>
                </TCell>
                <TCell muted>{h.eventoReal}</TCell>
                <TCell>
                  <Badge color={estado.color} dot>
                    {estado.label}
                  </Badge>
                </TCell>
              </TRow>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
