'use client';

import { FilterBar, SelectInline, type FilterGroup } from '@mes/ui';
import type { EstadoLinea, LineaEstado, Sede } from '@mes/types';

export interface FiltrosLineas {
  linea: string[];
  estado: string[];
}

export const FILTROS_VACIOS: FiltrosLineas = { linea: [], estado: [] };

/** Tag "Todas" del grupo LÍNEA: seleccionado cuando no hay ninguna línea filtrada. */
const TODAS = '__todas__';

const ESTADOS: { value: EstadoLinea; label: string }[] = [
  { value: 'produciendo', label: 'Produciendo' },
  { value: 'parada', label: 'Parada' },
  { value: 'sin_orden', label: 'Sin orden' },
  { value: 'alerta', label: 'Alerta IA' },
  { value: 'sugerida', label: 'Sugerida' },
];

export interface LineasFilterBarProps {
  lineas: readonly LineaEstado[];
  sedes: readonly Sede[];
  sedeId: string;
  onSedeChange: (sedeId: string) => void;
  value: FiltrosLineas;
  onChange: (value: FiltrosLineas) => void;
}

/**
 * Filter bar de `Tiempo real` (Figma 2156:5364): fila 1 grupo LÍNEA + selector
 * inline y "Limpiar filtros" a la derecha; fila 2 grupo ESTADO. Filtra en
 * cliente sobre la respuesta de `/tiempo-real/lineas`.
 */
export function LineasFilterBar({
  lineas,
  sedes,
  sedeId,
  onSedeChange,
  value,
  onChange,
}: LineasFilterBarProps) {
  const grupoLinea: FilterGroup = {
    id: 'linea',
    label: 'Línea',
    options: [
      { value: TODAS, label: 'Todas' },
      ...lineas.map((l) => ({ value: l.lineaId, label: `${l.lineaCodigo} ${l.lineaNombre}` })),
    ],
  };
  const grupoEstado: FilterGroup = {
    id: 'estado',
    label: 'Estado',
    options: ESTADOS,
  };
  const hayFiltros = value.linea.length > 0 || value.estado.length > 0;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterBar
          groups={[grupoLinea]}
          value={{ linea: value.linea.length > 0 ? value.linea : [TODAS] }}
          onChange={(next) => {
            const lista = next.linea ?? [];
            /* "Todas" está activo cuando no hay ninguna línea filtrada: si se
               toca una línea se conserva solo esa; si se toca "Todas" se limpia. */
            const teniaTodas = value.linea.length === 0;
            const sinTodas = lista.filter((v) => v !== TODAS);
            onChange({
              ...value,
              linea: teniaTodas ? sinTodas : lista.includes(TODAS) ? [] : lista,
            });
          }}
        />
        <div className="flex items-center gap-4">
          <SelectInline
            label="Sede"
            options={sedes.map((s) => ({ value: s.id, label: s.nombre, disabled: !s.activa }))}
            value={sedeId}
            onValueChange={onSedeChange}
          />
          {hayFiltros && (
            <button
              type="button"
              className="text-body-sm font-medium text-primary hover:underline"
              onClick={() => onChange(FILTROS_VACIOS)}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>
      <FilterBar
        groups={[grupoEstado]}
        value={{ estado: value.estado }}
        onChange={(next) => onChange({ ...value, estado: next.estado ?? [] })}
      />
    </div>
  );
}

/** Filtrado en cliente de las tarjetas (los Tags no recargan el tablero). */
export function filtrarLineas(
  lineas: readonly LineaEstado[],
  filtros: FiltrosLineas,
): LineaEstado[] {
  return lineas.filter(
    (l) =>
      (filtros.linea.length === 0 || filtros.linea.includes(l.lineaId)) &&
      (filtros.estado.length === 0 || filtros.estado.includes(l.estado)),
  );
}
