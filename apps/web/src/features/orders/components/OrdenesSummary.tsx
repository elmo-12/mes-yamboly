'use client';

import { Skeleton, SummaryCard } from '@mes/ui';
import { formatNumber } from '@mes/shared';
import type { OrdenesResumen } from '@mes/types';
import type { ResumenOrdenes } from '../use-ordenes-filtros';

const TARJETAS: ReadonlyArray<{ id: ResumenOrdenes; label: string; campo: keyof OrdenesResumen }> = [
  { id: 'todas', label: 'Todas', campo: 'todas' },
  { id: 'por_validar', label: 'Por validar', campo: 'porValidar' },
  { id: 'con_paradas', label: 'Con paradas', campo: 'conParadas' },
  { id: 'con_mermas', label: 'Con mermas', campo: 'conMermas' },
];

export interface OrdenesSummaryProps {
  resumen?: OrdenesResumen;
  cargando: boolean;
  activa: ResumenOrdenes;
  onChange: (id: ResumenOrdenes) => void;
}

/**
 * 4 Summary card 267×80 (Figma 2156:4265). Es un filtro: solo una activa,
 * borde 1,5 px `primary` y label en `primary`.
 */
export function OrdenesSummary({ resumen, cargando, activa, onChange }: OrdenesSummaryProps) {
  if (cargando) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {TARJETAS.map((t) => (
          <Skeleton key={t.id} className="h-20 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {TARJETAS.map((t) => (
        <SummaryCard
          key={t.id}
          label={t.label}
          value={formatNumber(Number(resumen?.[t.campo] ?? 0))}
          active={activa === t.id}
          onClick={() => onChange(t.id)}
        />
      ))}
    </div>
  );
}
