'use client';

import * as React from 'react';
import { Badge, Icon, cn } from '@mes/ui';
import type { CausaParadaNodo } from '@mes/types';

export interface CausasTreeProps {
  nodos: readonly CausaParadaNodo[];
  seleccionadaId?: string;
  onSelect: (nodo: CausaParadaNodo) => void;
  /** Texto de búsqueda ya normalizado. */
  filtro: string;
}

/**
 * Árbol Tipo → General → Específica del panel izquierdo de Configuración
 * (Figma 2163:18282). Los nodos con hijos se expanden; el seleccionado queda
 * con fondo `primary/subtle`.
 */
export function CausasTree({ nodos, seleccionadaId, onSelect, filtro }: CausasTreeProps) {
  const [cerrados, setCerrados] = React.useState<readonly string[]>([]);

  const coincide = React.useCallback(
    (n: CausaParadaNodo): boolean => {
      if (!filtro) return true;
      const texto = `${n.codigo} ${n.nombre}`.toLowerCase();
      return texto.includes(filtro) || n.hijos.some(coincide);
    },
    [filtro],
  );

  const alternar = (id: string) =>
    setCerrados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const render = (nodo: CausaParadaNodo, nivel: number): React.ReactNode => {
    if (!coincide(nodo)) return null;
    const tieneHijos = nodo.hijos.length > 0;
    /* Con búsqueda activa el árbol se muestra desplegado. */
    const abierto = Boolean(filtro) || !cerrados.includes(nodo.id);
    const activo = nodo.id === seleccionadaId;

    return (
      <li key={nodo.id}>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-sm pr-2',
            activo ? 'bg-primary-subtle' : 'hover:bg-background-subtle',
          )}
          style={{ paddingLeft: 8 + nivel * 14 }}
        >
          {tieneHijos ? (
            <button
              type="button"
              aria-label={abierto ? `Contraer ${nodo.codigo}` : `Expandir ${nodo.codigo}`}
              aria-expanded={abierto}
              onClick={() => alternar(nodo.id)}
              className="grid size-5 shrink-0 place-items-center rounded-xs text-text-secondary hover:text-text-primary focus-visible:shadow-focus focus-visible:outline-none"
            >
              <Icon name={abierto ? 'chevron-down' : 'chevron-right'} size={16} />
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}

          <button
            type="button"
            onClick={() => onSelect(nodo)}
            aria-current={activo ? 'true' : undefined}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-body focus-visible:rounded-xs focus-visible:shadow-focus focus-visible:outline-none',
              activo
                ? 'font-medium text-info-text'
                : nodo.nivel === 'tipo'
                  ? 'font-medium text-text-primary'
                  : 'text-neutral-text',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{`${nodo.codigo} · ${nodo.nombre}`}</span>
            {nodo.estado === 'inactivo' && <Badge color="neutral">Inactiva</Badge>}
          </button>
        </div>

        {tieneHijos && abierto && (
          <ul className="flex flex-col">{nodo.hijos.map((h) => render(h, nivel + 1))}</ul>
        )}
      </li>
    );
  };

  return <ul className="flex flex-col">{nodos.map((n) => render(n, 0))}</ul>;
}
