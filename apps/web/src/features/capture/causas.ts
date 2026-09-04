import type { CausaMermaNodo, CausaParada, CausaParadaNodo, NodoCausaBase } from '@mes/types';
import { cadenaDeCausa, hojasDeTipo, todasLasHojas, type NodoArbol } from '@/features/catalogs/causas';

/** Los tipos raíz del árbol de causas de parada (`PP-01` … `PS-05`). */
export function tiposDeParada(arbol: readonly CausaParadaNodo[]): CausaParadaNodo[] {
  return arbol.filter((c) => c.nivel === 'tipo');
}

/** Los tipos raíz del árbol de causas de merma (`MP-01` … `MP-05`). */
export function tiposDeMerma(arbol: readonly CausaMermaNodo[]): CausaMermaNodo[] {
  return arbol.filter((c) => c.nivel === 'tipo');
}

/** Hojas activas colgadas de un nodo raíz del árbol. */
export function hojasDe<T extends NodoArbol<T>>(raiz: T | undefined, nivelHoja: string): T[] {
  if (!raiz) return [];
  return hojasDeTipo([raiz], raiz.id, nivelHoja);
}

/** Causas específicas colgadas de un tipo (Tipo → General → Específica). */
export function causasEspecificasDe(tipo: CausaParadaNodo | undefined): CausaParada[] {
  return hojasDe(tipo, 'especifica');
}

/** Causas (nivel 3) colgadas de un tipo de merma (Tipo → Clasificación → Causa). */
export function causasDeMermaDe(tipo: CausaMermaNodo | undefined): CausaMermaNodo[] {
  return hojasDe(tipo, 'causa');
}

/** `PM-01 Falla mecánica` */
export function etiquetaCausa(causa: Pick<NodoCausaBase, 'codigo' | 'nombre'>): string {
  return `${causa.codigo} ${causa.nombre}`;
}

/** `MP-01 · MP-01-A · MP-01-01` — camino tipo → clasificación → causa. */
export function rutaDeCausa<T extends NodoArbol<T>>(
  arbol: readonly T[],
  id: string | undefined,
  separador = ' › ',
): string {
  return cadenaDeCausa(arbol, id)
    .map((c) => c.nombre)
    .join(separador);
}

/** Todas las causas específicas activas del árbol de paradas, por código. */
export function todasLasEspecificas(arbol: readonly CausaParadaNodo[]): CausaParada[] {
  return todasLasHojas(arbol, 'especifica');
}

/** Todas las causas activas (nivel 3) del árbol de mermas, por código. */
export function todasLasCausasDeMerma(arbol: readonly CausaMermaNodo[]): CausaMermaNodo[] {
  return todasLasHojas(arbol, 'causa');
}
