'use client';

import * as React from 'react';
import { Overline, Tag } from '@mes/ui';
import { ESTADOS_ORDEN, ESTADO_ORDEN_LABEL, PERIODOS, TURNOS, TURNO_LABEL } from '@mes/types';
import type { EstadoOrden, Periodo, Turno } from '@mes/types';
import { useLineas } from '@/features/catalogs/hooks';
import type { OrdenesFiltros } from '../use-ordenes-filtros';

const PERIODO_LABEL: Record<Periodo, string> = {
  hoy: 'Hoy',
  semana: 'Semana',
  mes: 'Mes',
  trimestre: 'Trimestre',
  personalizado: 'Personalizado',
};

/** El listado usa 4 periodos (spec 05.A); `trimestre` queda para Reportes. */
const PERIODOS_LISTADO = PERIODOS.filter((p) => p !== 'trimestre');

export interface OrdenesFilterBarProps {
  filtros: OrdenesFiltros;
  onChange: (parcial: Partial<OrdenesFiltros>) => void;
  onClear: () => void;
  hayFiltros: boolean;
}

/**
 * Filter bar **en línea** de Órdenes (Figma 2156:5592): cada grupo es una fila
 * con el Overline de ancho fijo 96 + Tags 28, y "Limpiar filtros" al final de
 * la primera fila. Es la disposición que `docs/design-system.md` §3.3 describe
 * para esta pantalla; la de `@mes/ui/FilterBar` es la apilada de Alertas.
 */
export function OrdenesFilterBar({
  filtros,
  onChange,
  onClear,
  hayFiltros,
}: OrdenesFilterBarProps) {
  const { data: lineas } = useLineas();
  const lineasProduccion = lineas?.data ?? [];

  const alternar = React.useCallback(
    <T extends string>(actual: readonly T[], valor: T): T[] =>
      actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor],
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <Fila label="PERIODO">
        {PERIODOS_LISTADO.map((p) => (
          <Tag
            key={p}
            size="md"
            selected={filtros.periodo === p}
            onClick={() => onChange({ periodo: p })}
          >
            {PERIODO_LABEL[p]}
          </Tag>
        ))}
        {hayFiltros && (
          <>
            <span className="min-w-4 flex-1" aria-hidden />
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 text-body-sm font-medium text-primary hover:underline"
            >
              Limpiar filtros
            </button>
          </>
        )}
      </Fila>

      <Fila label="LÍNEA">
        {lineasProduccion.map((l) => (
          <Tag
            key={l.id}
            size="md"
            selected={filtros.linea.includes(l.id)}
            onClick={() => onChange({ linea: alternar(filtros.linea, l.id) })}
          >
            {`${l.codigo} ${l.nombre}`}
          </Tag>
        ))}
      </Fila>

      <Fila label="TURNO">
        {TURNOS.map((t) => (
          <Tag
            key={t}
            size="md"
            selected={filtros.turno.includes(t)}
            onClick={() => onChange({ turno: alternar<Turno>(filtros.turno, t) })}
          >
            {TURNO_LABEL[t]}
          </Tag>
        ))}
      </Fila>

      <Fila label="ESTADO">
        {ESTADOS_ORDEN.map((e) => (
          <Tag
            key={e}
            size="md"
            selected={filtros.estado.includes(e)}
            onClick={() =>
              onChange({ estado: alternar<EstadoOrden>(filtros.estado, e), resumen: 'todas' })
            }
          >
            {ESTADO_ORDEN_LABEL[e]}
          </Tag>
        ))}
      </Fila>
    </div>
  );
}

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Overline className="w-24 shrink-0 text-text-disabled">{label}</Overline>
      {children}
    </div>
  );
}
