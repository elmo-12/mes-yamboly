import type { CausaParada, CausaParadaNodo } from '@mes/types';

/** Causa del árbol con el tipo raíz al que pertenece (`PM-01`). */
export interface CausaPlana extends CausaParada {
  raizId: string;
  /** Profundidad en el árbol: 0 tipo · 1 general · 2 específica. */
  nivelIndice: number;
}

/**
 * Aplana el árbol `Tipo → General → Específica` de `GET /causas-parada`
 * conservando la raíz de cada nodo, que es lo que necesitan el formulario de
 * parada (tipo → causa específica) y el árbol de Configuración.
 */
export function aplanarCausas(
  nodos: readonly CausaParadaNodo[],
  raizId?: string,
  nivelIndice = 0,
): CausaPlana[] {
  return nodos.flatMap((nodo) => {
    const { hijos, ...causa } = nodo;
    const raiz = raizId ?? nodo.id;
    return [
      { ...causa, raizId: raiz, nivelIndice },
      ...aplanarCausas(hijos, raiz, nivelIndice + 1),
    ];
  });
}

/** Causas específicas activas de un tipo raíz, para el selector de parada. */
export function especificasDeTipo(
  nodos: readonly CausaParadaNodo[],
  tipoId: string,
): CausaPlana[] {
  return aplanarCausas(nodos).filter(
    (c) => c.raizId === tipoId && c.nivel === 'especifica' && c.estado === 'activo',
  );
}
