'use client';

import { Tag } from '@mes/ui';
import type { EstadoLinea, LineaEstado } from '@mes/types';
import { formatNumber } from '@mes/shared';

export interface FiltrosLineas {
  estado: string[];
}

export const FILTROS_VACIOS: FiltrosLineas = { estado: [] };

const ESTADOS: { value: EstadoLinea; label: string; resumen: string }[] = [
  { value: 'produciendo', label: 'Produciendo', resumen: 'produciendo' },
  { value: 'parada', label: 'Parada', resumen: 'parada' },
  { value: 'sin_orden', label: 'Sin orden', resumen: 'sin orden' },
  { value: 'alerta', label: 'Alerta IA', resumen: 'alerta' },
  { value: 'sugerida', label: 'Sugerida', resumen: 'sugerida' },
];

export interface LineasFilterBarProps {
  lineas: readonly LineaEstado[];
  value: FiltrosLineas;
  onChange: (value: FiltrosLineas) => void;
}

/**
 * Fila compacta de Tiempo real: resumen del tablero ("9 líneas · 3 produciendo
 * · …") y los Tags de Estado. No hay filtro por línea (solo 9 puestos, caben
 * todos) ni selector de sede (Yamboly opera una única planta). Filtra en
 * cliente sobre la respuesta de `/tiempo-real/lineas`.
 */
export function LineasFilterBar({ lineas, value, onChange }: LineasFilterBarProps) {
  const conteo = (estado: EstadoLinea) => lineas.filter((l) => l.estado === estado).length;

  const resumen = [
    `${formatNumber(lineas.length)} ${lineas.length === 1 ? 'línea' : 'líneas'}`,
    ...ESTADOS.filter((e) => conteo(e.value) > 0).map(
      (e) => `${formatNumber(conteo(e.value))} ${e.resumen}`,
    ),
  ].join(' · ');

  const alternar = (estado: EstadoLinea) => {
    const activo = value.estado.includes(estado);
    onChange({
      estado: activo ? value.estado.filter((e) => e !== estado) : [...value.estado, estado],
    });
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-3">
      <p className="text-body-sm text-text-secondary">{resumen}</p>
      <div className="flex flex-wrap items-center gap-2">
        {ESTADOS.map((e) => (
          <Tag
            key={e.value}
            size="md"
            selected={value.estado.includes(e.value)}
            onClick={() => alternar(e.value)}
          >
            {e.label}
          </Tag>
        ))}
      </div>
      {value.estado.length > 0 && (
        <button
          type="button"
          className="text-body-sm font-medium text-primary hover:underline"
          onClick={() => onChange(FILTROS_VACIOS)}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

/** Filtrado en cliente de las tarjetas (los Tags no recargan el tablero). */
export function filtrarLineas(
  lineas: readonly LineaEstado[],
  filtros: FiltrosLineas,
): LineaEstado[] {
  return lineas.filter((l) => filtros.estado.length === 0 || filtros.estado.includes(l.estado));
}
