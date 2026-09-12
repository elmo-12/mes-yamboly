/**
 * Minería de reglas asociativas (Apriori) — implementación pura.
 *
 * No conoce Nest, TypeORM ni el dominio de planta: recibe «cestas» de ítems ya
 * construidas y devuelve itemsets frecuentes y reglas. Esa separación es lo que
 * permite probar el algoritmo con datasets sintéticos (`apriori.spec.ts`) sin
 * levantar la base de datos.
 *
 * El plan (§5.5) limita los itemsets a tamaño ≤ 3 porque con ~225 cestas y
 * ~120 ítems los itemsets de 4 o más dejan de tener soporte estadístico.
 */

/** Ítem de una cesta. Convención del dominio: `clave=valor` o bandera suelta. */
export type Item = string;

/** Conjunto de ítems observados juntos en una unidad de análisis. */
export interface Cesta {
  /** Identificador estable de la cesta (`LIN-LLEN-M2|2026-09-02|D`). */
  id: string;
  items: readonly Item[];
}

export interface OpcionesApriori {
  /** Soporte absoluto mínimo: nº de cestas que contienen el itemset. */
  soporteMinimo?: number;
  /** Confianza mínima de la regla, en 0–1. */
  confianzaMinima?: number;
  /** Lift mínimo: cuánto supera la regla al azar (1 = independencia). */
  liftMinimo?: number;
  /** Nº máximo de ítems por itemset. */
  tamanoMaximoItemset?: number;
}

/** Umbrales del plan §5.5: soporte ≥ 3, confianza ≥ 0,6, lift ≥ 1,3, k ≤ 3. */
export const OPCIONES_APRIORI: Required<OpcionesApriori> = {
  soporteMinimo: 3,
  confianzaMinima: 0.6,
  liftMinimo: 1.3,
  tamanoMaximoItemset: 3,
};

export interface ItemsetFrecuente {
  /** Ítems ordenados alfabéticamente (forma canónica). */
  items: Item[];
  /** Soporte absoluto: nº de cestas que lo contienen. */
  soporte: number;
  /** Soporte relativo 0–1 sobre el total de cestas. */
  soporteRelativo: number;
  /** Ids de las cestas que lo contienen, en el orden en que se recibieron. */
  cestas: string[];
}

export interface ReglaAsociativa {
  /** Parte izquierda de la regla (1 o 2 ítems con `tamanoMaximoItemset` = 3). */
  antecedente: Item[];
  /** Parte derecha: siempre un único ítem, para que la frase generada sea legible. */
  consecuente: Item;
  /** `antecedente ∪ {consecuente}` en forma canónica. */
  items: Item[];
  /** Soporte absoluto del itemset completo. */
  soporte: number;
  soporteRelativo: number;
  /** Confianza en 0–1: `soporte(items) / soporte(antecedente)`. */
  confianza: number;
  /** Lift: `confianza / soporteRelativo(consecuente)`. */
  lift: number;
  /** Ids de las cestas que cumplen antecedente y consecuente a la vez. */
  cestas: string[];
}

/** Separador de control: no puede aparecer dentro de un ítem del dominio. */
const SEPARADOR = '\u0001';

/**
 * Margen para comparar flotantes contra los umbrales. Sin él, una confianza de
 * 0,6 calculada como `3 / 5` podría quedar fuera por un error de redondeo.
 */
const EPSILON = 1e-9;

function clave(items: readonly Item[]): string {
  return items.join(SEPARADOR);
}

/**
 * Comparación por unidades de código, la misma que usa `Array.prototype.sort`
 * sin argumentos. Apriori depende de que el orden de los ítems dentro de la
 * cesta y el orden de los itemsets del nivel sean **el mismo**; `localeCompare`
 * rompería esa invariante (ordena `ñ` antes que `z`, `sort()` al revés).
 */
function comparar(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Cestas sin ítems repetidos y con los ítems ordenados (forma canónica). */
function canonizar(cestas: readonly Cesta[]): { id: string; items: Item[] }[] {
  return cestas.map((cesta) => ({
    id: cesta.id,
    items: [...new Set(cesta.items)].sort(),
  }));
}

/** Intersección de dos listas de índices ascendentes, en O(n + m). */
function intersecar(a: readonly number[], b: readonly number[]): number[] {
  const salida: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      salida.push(a[i]);
      i += 1;
      j += 1;
    } else if (a[i] < b[j]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return salida;
}

/**
 * ¿Comparten las dos listas los primeros `k-2` ítems y la primera es menor en
 * el último? Es la condición de unión de Apriori: evita generar el mismo
 * candidato dos veces.
 */
function unibles(a: readonly Item[], b: readonly Item[]): boolean {
  for (let i = 0; i < a.length - 1; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return a[a.length - 1] < b[b.length - 1];
}

/**
 * Poda de Apriori: un itemset sólo puede ser frecuente si **todos** sus
 * subconjuntos de tamaño `k-1` lo son.
 */
function subconjuntosFrecuentes(
  candidato: readonly Item[],
  frecuentes: ReadonlySet<string>,
): boolean {
  for (let i = 0; i < candidato.length; i += 1) {
    const subconjunto = candidato.filter((_, j) => j !== i);
    if (!frecuentes.has(clave(subconjunto))) return false;
  }
  return true;
}

interface NivelInterno {
  items: Item[];
  indices: number[];
}

/**
 * Itemsets frecuentes por niveles (Apriori clásico). Devuelve todos los tamaños
 * desde 1 hasta `tamanoMaximoItemset`, ordenados por tamaño y alfabéticamente.
 */
export function minarItemsets(
  cestas: readonly Cesta[],
  opciones: OpcionesApriori = {},
): ItemsetFrecuente[] {
  const op = { ...OPCIONES_APRIORI, ...opciones };
  const canonicas = canonizar(cestas);
  const total = canonicas.length;
  if (total === 0 || op.tamanoMaximoItemset < 1 || op.soporteMinimo < 1) return [];

  /* Nivel 1: un recorrido por las cestas basta para tener los índices de cada ítem. */
  const indicesPorItem = new Map<Item, number[]>();
  canonicas.forEach((cesta, indice) => {
    for (const item of cesta.items) {
      const lista = indicesPorItem.get(item);
      if (lista) lista.push(indice);
      else indicesPorItem.set(item, [indice]);
    }
  });

  let nivel: NivelInterno[] = [...indicesPorItem.entries()]
    .filter(([, indices]) => indices.length >= op.soporteMinimo)
    .map(([item, indices]) => ({ items: [item], indices }))
    .sort((a, b) => comparar(a.items[0], b.items[0]));

  const acumulado: NivelInterno[] = [...nivel];

  for (let k = 2; k <= op.tamanoMaximoItemset && nivel.length > 1; k += 1) {
    const clavesNivel = new Set(nivel.map((n) => clave(n.items)));
    const siguiente: NivelInterno[] = [];
    for (let a = 0; a < nivel.length; a += 1) {
      for (let b = a + 1; b < nivel.length; b += 1) {
        const uno = nivel[a];
        const dos = nivel[b];
        if (!unibles(uno.items, dos.items)) continue;
        const candidato = [...uno.items, dos.items[dos.items.length - 1]];
        if (!subconjuntosFrecuentes(candidato, clavesNivel)) continue;
        const indices = intersecar(uno.indices, dos.indices);
        if (indices.length < op.soporteMinimo) continue;
        siguiente.push({ items: candidato, indices });
      }
    }
    siguiente.sort((x, y) => comparar(clave(x.items), clave(y.items)));
    acumulado.push(...siguiente);
    nivel = siguiente;
  }

  return acumulado.map((entrada) => ({
    items: entrada.items,
    soporte: entrada.indices.length,
    soporteRelativo: entrada.indices.length / total,
    cestas: entrada.indices.map((indice) => canonicas[indice].id),
  }));
}

/**
 * Reglas `antecedente → consecuente` (consecuente de un solo ítem) que superan
 * los tres umbrales. Salen ordenadas por lift descendente; quien las consume
 * (el servicio) las reordena por impacto en minutos, como pide el plan.
 */
export function generarReglas(
  cestas: readonly Cesta[],
  opciones: OpcionesApriori = {},
): ReglaAsociativa[] {
  const op = { ...OPCIONES_APRIORI, ...opciones };
  const total = cestas.length;
  if (total === 0) return [];

  const itemsets = minarItemsets(cestas, op);
  const porClave = new Map(itemsets.map((conjunto) => [clave(conjunto.items), conjunto]));
  const reglas: ReglaAsociativa[] = [];

  for (const conjunto of itemsets) {
    if (conjunto.items.length < 2) continue;
    for (const consecuente of conjunto.items) {
      const antecedente = conjunto.items.filter((item) => item !== consecuente);
      const soporteAntecedente = porClave.get(clave(antecedente));
      const soporteConsecuente = porClave.get(clave([consecuente]));
      /* Ambos existen por la propiedad de anti-monotonía, pero el guardia evita
       * que un cambio futuro en la poda provoque una división por `undefined`. */
      if (!soporteAntecedente || !soporteConsecuente) continue;

      const confianza = conjunto.soporte / soporteAntecedente.soporte;
      if (confianza + EPSILON < op.confianzaMinima) continue;
      const lift = confianza / soporteConsecuente.soporteRelativo;
      if (lift + EPSILON < op.liftMinimo) continue;

      reglas.push({
        antecedente,
        consecuente,
        items: conjunto.items,
        soporte: conjunto.soporte,
        soporteRelativo: conjunto.soporteRelativo,
        confianza,
        lift,
        cestas: conjunto.cestas,
      });
    }
  }

  return reglas.sort(
    (a, b) =>
      b.lift - a.lift ||
      b.soporte - a.soporte ||
      b.confianza - a.confianza ||
      comparar(clave(a.items), clave(b.items)) ||
      comparar(a.consecuente, b.consecuente),
  );
}
