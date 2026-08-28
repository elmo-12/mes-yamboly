'use client';

import * as React from 'react';
import { cn } from '../utils/cn';
import { Tag } from '../primitives/tag';
import { Overline } from '../primitives/feedback';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterGroup {
  id: string;
  /** Overline del grupo: PERIODO · LÍNEA · TURNO · ESTADO. */
  label: string;
  options: readonly FilterOption[];
  /** Permite varios valores a la vez (por defecto `true`). */
  multiple?: boolean;
}

export interface FilterBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  groups: readonly FilterGroup[];
  /** Valores seleccionados por id de grupo. */
  value: Readonly<Record<string, readonly string[]>>;
  onChange: (next: Record<string, string[]>) => void;
  onClear?: () => void;
  clearLabel?: string;
  /**
   * ADITIVO (V5, Alertas 2156:5417) — disposición apilada: un grupo por fila
   * (Overline + pills) con "Limpiar filtros" alineado arriba a la derecha, tal
   * como aparece en la bandeja de Alertas. Por defecto, grupos en línea.
   */
  stacked?: boolean;
}

/** Barra de filtros: grupos con Overline + Tags seleccionables + "Limpiar filtros". */
export function FilterBar({
  groups,
  value,
  onChange,
  onClear,
  clearLabel = 'Limpiar filtros',
  stacked = false,
  className,
  ...props
}: FilterBarProps) {
  const toggle = (group: FilterGroup, option: string) => {
    const current = value[group.id] ?? [];
    const multiple = group.multiple ?? true;
    let next: string[];
    if (!multiple) {
      next = current.includes(option) ? [] : [option];
    } else {
      next = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
    }
    onChange({ ...structuredCloneValue(value), [group.id]: next });
  };

  const hasAny = Object.values(value).some((v) => v.length > 0);

  const limpiar = hasAny && onClear && (
    <button
      type="button"
      onClick={onClear}
      className={cn(
        'text-body-sm font-medium text-primary hover:underline',
        stacked ? 'self-end' : 'self-start',
      )}
    >
      {clearLabel}
    </button>
  );

  const grupos = groups.map((g) => (
    <div key={g.id} className={cn('flex flex-col', stacked ? 'w-full gap-1.5' : 'gap-2')}>
      <Overline className={stacked ? 'text-text-disabled' : undefined}>{g.label}</Overline>
      <div className="flex flex-wrap gap-2">
        {g.options.map((o) => (
          <Tag
            key={o.value}
            size="md"
            selected={(value[g.id] ?? []).includes(o.value)}
            count={o.count}
            onClick={() => toggle(g, o.value)}
          >
            {o.label}
          </Tag>
        ))}
      </div>
    </div>
  ));

  if (stacked) {
    return (
      <div className={cn('flex flex-col gap-1.5', className)} {...props}>
        <div className="flex min-h-4 items-center justify-end">{limpiar}</div>
        {grupos}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)} {...props}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">{grupos}</div>
      {limpiar}
    </div>
  );
}

function structuredCloneValue(v: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, arr] of Object.entries(v)) out[k] = [...arr];
  return out;
}
