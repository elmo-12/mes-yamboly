import type { CausaParada, CausaParadaNodo } from '@mes/types';

/** Los 7 tipos raíz del árbol de causas (PM-01 … PS-07). */
export function tiposDeParada(arbol: readonly CausaParadaNodo[]): CausaParadaNodo[] {
  return arbol.filter((c) => c.nivel === 'tipo');
}

/** Causas específicas colgadas de un tipo (nivel Tipo → General → Específica). */
export function causasEspecificasDe(tipo: CausaParadaNodo | undefined): CausaParada[] {
  if (!tipo) return [];
  const salida: CausaParada[] = [];
  const visitar = (nodo: CausaParadaNodo) => {
    if (nodo.nivel === 'especifica') salida.push(nodo);
    for (const hijo of nodo.hijos ?? []) visitar(hijo);
  };
  for (const hijo of tipo.hijos ?? []) visitar(hijo);
  return salida;
}

/** `PM-01 Falla mecánica` */
export function etiquetaCausa(causa: Pick<CausaParada, 'codigo' | 'nombre'>): string {
  return `${causa.codigo} ${causa.nombre}`;
}

/** Todas las causas específicas del árbol, en orden de código. */
export function todasLasEspecificas(arbol: readonly CausaParadaNodo[]): CausaParada[] {
  const salida: CausaParada[] = [];
  const visitar = (nodo: CausaParadaNodo) => {
    if (nodo.nivel === 'especifica') salida.push(nodo);
    for (const hijo of nodo.hijos ?? []) visitar(hijo);
  };
  for (const raiz of arbol) visitar(raiz);
  return salida.sort((a, b) => a.codigo.localeCompare(b.codigo));
}
