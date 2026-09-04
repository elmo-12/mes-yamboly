import type { CausaMermaNodo, CausaParadaNodo, NodoCausaBase } from '@mes/types';

interface ConHijos<T> {
  hijos: readonly T[];
}

/**
 * Contrato mínimo de un nodo de árbol de causas. Lo cumplen `CausaParadaNodo`
 * (tipo → general → específica) y `CausaMermaNodo` (tipo → clasificación →
 * causa), de modo que estos helpers y `CausasTree` sirven a los dos catálogos.
 */
export type NodoArbol<T> = NodoCausaBase & ConHijos<T>;

/** Causa del árbol con la raíz a la que pertenece y su profundidad. */
export type CausaPlana<T extends NodoCausaBase> = T & {
  /** Id del nodo raíz (`CPA-PN-02`, `CME-MP-01`). */
  raizId: string;
  /** Profundidad en el árbol: 0 raíz · 1 intermedio · 2 hoja. */
  nivelIndice: number;
};

/** Causa de parada aplanada — atajo para las vistas que ya la usaban así. */
export type CausaParadaPlana = CausaPlana<CausaParadaNodo>;
/** Causa de merma aplanada. */
export type CausaMermaPlana = CausaPlana<CausaMermaNodo>;

/**
 * Aplana un árbol de causas de 3 niveles conservando la raíz de cada nodo, que
 * es lo que necesitan el selector jerárquico de captura y el árbol de
 * Configuración.
 */
export function aplanarCausas<T extends NodoArbol<T>>(
  nodos: readonly T[],
  raizId?: string,
  nivelIndice = 0,
): CausaPlana<T>[] {
  return nodos.flatMap((nodo) => {
    const raiz = raizId ?? nodo.id;
    const plana = { ...nodo, raizId: raiz, nivelIndice } as CausaPlana<T>;
    return [plana, ...aplanarCausas<T>(nodo.hijos, raiz, nivelIndice + 1)];
  });
}

/** Busca un nodo por id en cualquier nivel del árbol. */
export function buscarCausa<T extends NodoArbol<T>>(
  nodos: readonly T[],
  id: string | undefined,
): CausaPlana<T> | undefined {
  if (!id) return undefined;
  return aplanarCausas<T>(nodos).find((c) => c.id === id);
}

/**
 * Hojas (nivel 3) activas colgadas de un tipo raíz.
 *
 * @param nivelHoja `'especifica'` en paradas · `'causa'` en mermas.
 */
export function hojasDeTipo<T extends NodoArbol<T>>(
  nodos: readonly T[],
  tipoId: string,
  nivelHoja: string,
): CausaPlana<T>[] {
  return aplanarCausas<T>(nodos).filter(
    (c) => c.raizId === tipoId && c.nivel === nivelHoja && c.estado === 'activo',
  );
}

/** Todas las hojas activas del árbol, ordenadas por código. */
export function todasLasHojas<T extends NodoArbol<T>>(
  nodos: readonly T[],
  nivelHoja: string,
): CausaPlana<T>[] {
  return aplanarCausas<T>(nodos)
    .filter((c) => c.nivel === nivelHoja && c.estado === 'activo')
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * Cadena raíz → hoja de una causa (`tipo → clasificación → causa`). La usa el
 * resumen del wizard de merma para mostrar el camino completo.
 */
export function cadenaDeCausa<T extends NodoArbol<T>>(
  nodos: readonly T[],
  id: string | undefined,
): CausaPlana<T>[] {
  if (!id) return [];
  const porId = new Map(aplanarCausas<T>(nodos).map((c) => [c.id, c]));
  const cadena: CausaPlana<T>[] = [];
  let actual = porId.get(id);
  while (actual) {
    cadena.unshift(actual);
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
  }
  return cadena;
}

/** `PN-02-01 · Falla mantto` — mismo texto que muestra el árbol. */
export function etiquetaNodo(causa: Pick<NodoCausaBase, 'codigo' | 'nombre'>): string {
  return `${causa.codigo} · ${causa.nombre}`;
}

/** Causas específicas activas de un tipo de parada (selector de parada). */
export function especificasDeTipo(
  nodos: readonly CausaParadaNodo[],
  tipoId: string,
): CausaParadaPlana[] {
  return hojasDeTipo(nodos, tipoId, 'especifica');
}

/** Causas (nivel 3) activas de un tipo de merma. */
export function causasDeTipoMerma(
  nodos: readonly CausaMermaNodo[],
  tipoId: string,
): CausaMermaPlana[] {
  return hojasDeTipo(nodos, tipoId, 'causa');
}
