'use client';

import * as React from 'react';
import { Badge, Icon, cn } from '@mes/ui';
import type { NodoArbol } from '@/features/catalogs/causas';

/** Bloque del árbol con su propio encabezado overline. */
export interface GrupoCausas<T> {
  id: string;
  /** Overline del grupo: «Paradas planificadas», «MP-01 · Merma del proceso»… */
  label: string;
  /** Raíces que cuelgan del grupo. */
  nodos: readonly T[];
}

export interface CausasTreeProps<T extends NodoArbol<T>> {
  nodos: readonly T[];
  /**
   * Agrupación configurable de las raíces. Causas de parada agrupan por
   * `clasificacion` (planificada / no planificada) y causas de merma por tipo
   * raíz. Sin `grupos` el árbol se pinta seguido, sin encabezados.
   */
  grupos?: (nodos: readonly T[]) => readonly GrupoCausas<T>[];
  seleccionadaId?: string;
  onSelect: (nodo: T) => void;
  /** Texto de búsqueda ya normalizado (minúsculas, sin espacios sobrantes). */
  filtro: string;
  /** Nombre legible del nivel (`Tipo`, `Clasificación`, `Causa`) para lectores de pantalla. */
  etiquetaNivel?: (nivel: string) => string;
}

/**
 * Árbol de 3 niveles del panel izquierdo de Configuración (Figma 2163:18282),
 * genérico sobre cualquier catálogo de causas (parada o merma). Los nodos con
 * hijos se expanden; el seleccionado queda con fondo `primary/subtle`.
 */
export function CausasTree<T extends NodoArbol<T>>({
  nodos,
  grupos,
  seleccionadaId,
  onSelect,
  filtro,
  etiquetaNivel,
}: CausasTreeProps<T>) {
  const [cerrados, setCerrados] = React.useState<readonly string[]>([]);

  const coincide = React.useCallback(
    (n: T): boolean => {
      if (!filtro) return true;
      const texto = `${n.codigo} ${n.nombre}`.toLowerCase();
      return texto.includes(filtro) || n.hijos.some(coincide);
    },
    [filtro],
  );

  const alternar = (id: string) =>
    setCerrados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const render = (nodo: T, nivel: number): React.ReactNode => {
    if (!coincide(nodo)) return null;
    const tieneHijos = nodo.hijos.length > 0;
    /* Con búsqueda activa el árbol se muestra desplegado. */
    const abierto = Boolean(filtro) || !cerrados.includes(nodo.id);
    const activo = nodo.id === seleccionadaId;
    const nivelLegible = etiquetaNivel?.(nodo.nivel);

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
            aria-label={
              nivelLegible ? `${nivelLegible}: ${nodo.codigo} ${nodo.nombre}` : undefined
            }
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-body focus-visible:rounded-xs focus-visible:shadow-focus focus-visible:outline-none',
              activo
                ? 'font-medium text-info-text'
                : nivel === 0
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

  if (!grupos) {
    return <ul className="flex flex-col">{nodos.map((n) => render(n, 0))}</ul>;
  }

  return (
    <div className="flex flex-col gap-3">
      {grupos(nodos).map((grupo) => {
        if (grupo.nodos.length === 0) return null;
        return (
          <div key={grupo.id} className="flex flex-col">
            <span className="px-2 py-1.5 text-overline text-text-disabled uppercase">
              {grupo.label}
            </span>
            <ul className="flex flex-col">{grupo.nodos.map((n) => render(n, 0))}</ul>
          </div>
        );
      })}
    </div>
  );
}
