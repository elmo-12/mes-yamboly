'use client';

import * as React from 'react';
import { Input, Overline, Tag } from '@mes/ui';
import type { Periodo, Turno } from '@mes/types';
import { TURNOS, TURNO_LABEL } from '@mes/types';
import { useLineas } from '@/features/catalogs/hooks';
import {
  COMPARAR_FILTRO,
  PERIODOS_FILTRO,
  type Comparar,
  type ReportFilters,
} from '../url-state';

export interface ReportesFilterBarProps {
  filtros: ReportFilters;
  onChange: (parcial: Partial<ReportFilters>) => void;
  onLimpiar: () => void;
  hayFiltros: boolean;
}

/**
 * `MES / Filter bar` de Reportes (Figma 2163:18529): dos filas de grupos con
 * Overline + Tags MDS (gap 32 entre grupos, 8 entre tags) y enlace
 * "Limpiar filtros". PERIODO = Personalizado despliega dos campos de fecha.
 */
export function ReportesFilterBar({
  filtros,
  onChange,
  onLimpiar,
  hayFiltros,
}: ReportesFilterBarProps) {
  const { data: lineas } = useLineas();
  const opcionesLinea = lineas?.data ?? [];

  const alternarLinea = (id: string) => {
    const actual = filtros.lineaId;
    onChange({ lineaId: actual.includes(id) ? actual.filter((v) => v !== id) : [...actual, id] });
  };

  const alternarTurno = (t: Turno) => {
    const actual = filtros.turno;
    onChange({ turno: actual.includes(t) ? actual.filter((v) => v !== t) : [...actual, t] });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <fieldset className="flex flex-col gap-2">
          <Overline>PERIODO</Overline>
          <div className="flex flex-wrap items-center gap-2">
            {PERIODOS_FILTRO.map((p) => (
              <Tag
                key={p.value}
                size="md"
                selected={filtros.periodo === p.value}
                onClick={() => onChange({ periodo: p.value as Periodo })}
              >
                {p.label}
              </Tag>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Overline>LÍNEA</Overline>
          <div className="flex flex-wrap items-center gap-2">
            <Tag size="md" selected={filtros.lineaId.length === 0} onClick={() => onChange({ lineaId: [] })}>
              Todas
            </Tag>
            {opcionesLinea.map((l) => (
              <Tag
                key={l.id}
                size="md"
                selected={filtros.lineaId.includes(l.id)}
                onClick={() => alternarLinea(l.id)}
              >
                {l.codigo}
              </Tag>
            ))}
          </div>
        </fieldset>
      </div>

      {filtros.periodo === 'personalizado' && (
        <div className="flex flex-wrap items-end gap-4">
          <Input
            type="date"
            size="sm"
            label="Desde"
            value={filtros.desde}
            max={filtros.hasta}
            onChange={(e) => onChange({ desde: e.target.value })}
            wrapperClassName="w-44"
            className="w-44"
          />
          <Input
            type="date"
            size="sm"
            label="Hasta"
            value={filtros.hasta}
            min={filtros.desde}
            onChange={(e) => onChange({ hasta: e.target.value })}
            wrapperClassName="w-44"
            className="w-44"
          />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <fieldset className="flex flex-col gap-2">
          <Overline>TURNO</Overline>
          <div className="flex flex-wrap items-center gap-2">
            <Tag size="md" selected={filtros.turno.length === 0} onClick={() => onChange({ turno: [] })}>
              Todos
            </Tag>
            {TURNOS.map((t) => (
              <Tag key={t} size="md" selected={filtros.turno.includes(t)} onClick={() => alternarTurno(t)}>
                {TURNO_LABEL[t]}
              </Tag>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Overline>COMPARAR CON</Overline>
          <div className="flex flex-wrap items-center gap-2">
            {COMPARAR_FILTRO.map((c) => (
              <Tag
                key={c.value}
                size="md"
                selected={filtros.comparar === c.value}
                onClick={() => onChange({ comparar: c.value as Comparar })}
              >
                {c.label}
              </Tag>
            ))}
          </div>
        </fieldset>

        {hayFiltros && (
          <button
            type="button"
            onClick={onLimpiar}
            className="pb-1.5 text-body-sm font-medium text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
