'use client';

import * as React from 'react';
import {
  Badge,
  Overline,
  SectionTitle,
  TBody,
  TCell,
  TH,
  THead,
  TRow,
  Table,
  Tag,
  tagVariants,
} from '@mes/ui';
import type { Patrones } from '@mes/types';
import { formatNumber, formatPct } from '@mes/shared';
import { HeatmapCausaTurno } from '@/features/reports/components/charts/HeatmapCausaTurno';
import { colorConfianza } from './ResumenTab';

export interface PatronesTabProps {
  patrones: Patrones;
}

const VARIABLES = ['Línea', 'Turno', 'Producto', 'Máquina', 'Causa'] as const;
type Variable = (typeof VARIABLES)[number];

const PERIODOS = ['30 días', '90 días', 'Año'] as const;

/** `Analítica / Patrones` (Figma 2156:4412). */
export function PatronesTab({ patrones }: PatronesTabProps) {
  const [periodo, setPeriodo] = React.useState<string>('90 días');
  const [variables, setVariables] = React.useState<Variable[]>(['Turno', 'Causa']);
  const [linea, setLinea] = React.useState<string>('Todas');

  const lineasDisponibles = React.useMemo(() => {
    const set = new Set<string>();
    patrones.recurrencias.forEach((r) => r.lineas.forEach((l) => set.add(l)));
    return ['Todas', ...[...set].sort()];
  }, [patrones.recurrencias]);

  const recurrencias =
    linea === 'Todas'
      ? patrones.recurrencias
      : patrones.recurrencias.filter((r) => r.lineas.includes(linea));

  const alternarVariable = (v: Variable) =>
    setVariables((actual) => (actual.includes(v) ? actual.filter((x) => x !== v) : [...actual, v]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <fieldset className="flex flex-col gap-2">
          <Overline>Periodo</Overline>
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <Tag key={p} size="md" selected={periodo === p} onClick={() => setPeriodo(p)}>
                {p}
              </Tag>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <Overline>Línea</Overline>
          <div className="flex flex-wrap gap-2">
            {lineasDisponibles.map((l) => (
              <Tag key={l} size="md" selected={linea === l} onClick={() => setLinea(l)}>
                {l}
              </Tag>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <Overline>Variable</Overline>
          <div className="flex flex-wrap gap-2">
            {VARIABLES.map((v) => (
              <Tag
                key={v}
                size="md"
                selected={variables.includes(v)}
                onClick={() => alternarVariable(v)}
              >
                {v}
              </Tag>
            ))}
          </div>
        </fieldset>
      </div>

      <SectionTitle
        title="Mapa de calor · causa de parada × turno"
        description="Minutos de parada acumulados en el periodo · 2 140 eventos registrados"
      />
      <HeatmapCausaTurno
        celdas={patrones.heatmap}
        title={null}
        subtitle={null}
        unidad="min"
        bordered={false}
      />

      <SectionTitle
        title="Recurrencias detectadas"
        description="Patrones repetidos con impacto significativo · ordenados por minutos perdidos"
      />
      <Table density="dense">
        <THead>
          <TRow plain>
            <TH>Patrón detectado</TH>
            <TH numeric>Frecuencia</TH>
            <TH numeric>Impacto (min)</TH>
            <TH>Líneas</TH>
            <TH numeric>Confianza</TH>
          </TRow>
        </THead>
        <TBody>
          {recurrencias.map((r) => (
            <TRow key={r.id}>
              <TCell>{r.patron}</TCell>
              <TCell numeric muted>
                {formatNumber(r.frecuencia)} eventos
              </TCell>
              <TCell numeric className="font-medium">
                {formatNumber(r.impactoMin)} min
              </TCell>
              <TCell>
                <span className="flex flex-wrap gap-1.5">
                  {r.lineas.map((l) => (
                    <span key={l} className={tagVariants({ size: 'sm', selected: false })}>
                      {l}
                    </span>
                  ))}
                </span>
              </TCell>
              <TCell numeric>
                <Badge color={colorConfianza(r.confianza)}>{formatPct(r.confianza, 0)}</Badge>
              </TCell>
            </TRow>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
