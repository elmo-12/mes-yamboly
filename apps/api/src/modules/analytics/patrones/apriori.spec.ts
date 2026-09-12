import { generarReglas, minarItemsets, OPCIONES_APRIORI, type Cesta } from './apriori';

/* ------------------------------------------------------------------ */
/* Utilidades de las pruebas                                           */
/* ------------------------------------------------------------------ */

/** Genera `n` cestas idénticas con un prefijo de id distinto. */
function repetir(prefijo: string, cantidad: number, items: string[]): Cesta[] {
  return Array.from({ length: cantidad }, (_, i) => ({ id: `${prefijo}-${i}`, items }));
}

/**
 * Congruencial lineal: el ruido del dataset sintético tiene que ser el mismo en
 * cada ejecución, o la prueba del patrón plantado sería intermitente.
 */
function aleatorioDeterminista(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 0x1_0000_0000;
  };
}

/**
 * 260 cestas de ruido (línea, turno y causa independientes entre sí) más 90
 * cestas con el patrón plantado `linea=L2 + turno=N ⇒ causa=C5`.
 *
 * El patrón está construido para que **sólo** se descubra con un itemset de
 * tamaño 3: `linea=L2 → causa=C5` se queda en 58 % de confianza y `turno=N →
 * causa=C5` en 41 %, ambos por debajo del umbral.
 */
function datasetConPatronPlantado(): Cesta[] {
  const aleatorio = aleatorioDeterminista(20_260_911);
  const lineas = ['linea=L1', 'linea=L2', 'linea=L3', 'linea=L4'];
  const turnos = ['turno=D', 'turno=N'];
  const causas = ['causa=C1', 'causa=C2', 'causa=C3', 'causa=C4'];
  const elegir = (opciones: string[]) => opciones[Math.floor(aleatorio() * opciones.length)];

  const ruido: Cesta[] = Array.from({ length: 260 }, (_, i) => ({
    id: `ruido-${i}`,
    items: [elegir(lineas), elegir(turnos), elegir(causas)],
  }));
  const plantadas = repetir('patron', 90, ['linea=L2', 'turno=N', 'causa=C5']);
  return [...ruido, ...plantadas];
}

/* ------------------------------------------------------------------ */
/* minarItemsets                                                       */
/* ------------------------------------------------------------------ */

describe('minarItemsets', () => {
  it('devuelve una lista vacía cuando no hay cestas', () => {
    expect(minarItemsets([])).toEqual([]);
  });

  it('devuelve una lista vacía cuando todas las cestas están vacías', () => {
    const cestas = repetir('vacia', 5, []);
    expect(minarItemsets(cestas, { soporteMinimo: 1 })).toEqual([]);
  });

  it('cuenta una sola vez los ítems repetidos dentro de la misma cesta', () => {
    const cestas: Cesta[] = [{ id: 'c1', items: ['a', 'a', 'a'] }];
    const itemsets = minarItemsets(cestas, { soporteMinimo: 1 });
    expect(itemsets).toHaveLength(1);
    expect(itemsets[0]).toMatchObject({ items: ['a'], soporte: 1, soporteRelativo: 1 });
  });

  it('con un único ítem por cesta no hay itemsets de tamaño 2', () => {
    const cestas = [...repetir('a', 4, ['a']), ...repetir('b', 4, ['b'])];
    const itemsets = minarItemsets(cestas, { soporteMinimo: 3 });
    expect(itemsets.map((i) => i.items)).toEqual([['a'], ['b']]);
  });

  it('descarta los itemsets por debajo del soporte mínimo', () => {
    const cestas = [...repetir('ab', 3, ['a', 'b']), { id: 'raro', items: ['a', 'z'] }];
    const itemsets = minarItemsets(cestas, { soporteMinimo: 3 });
    const claves = itemsets.map((i) => i.items.join('+'));
    expect(claves).toContain('a+b');
    expect(claves).not.toContain('z');
    expect(claves).not.toContain('a+z');
  });

  it('respeta el tamaño máximo de itemset', () => {
    const cestas = repetir('todo', 5, ['a', 'b', 'c', 'd']);
    const itemsets = minarItemsets(cestas, { soporteMinimo: 2, tamanoMaximoItemset: 3 });
    expect(Math.max(...itemsets.map((i) => i.items.length))).toBe(3);
    /* C(4,1) + C(4,2) + C(4,3) = 4 + 6 + 4 */
    expect(itemsets).toHaveLength(14);
  });

  it('calcula soporte absoluto, soporte relativo y cestas de origen', () => {
    const cestas = [...repetir('ab', 5, ['a', 'b']), ...repetir('solo-a', 5, ['a'])];
    const itemsets = minarItemsets(cestas, { soporteMinimo: 3 });
    const ab = itemsets.find((i) => i.items.join('+') === 'a+b');
    expect(ab).toMatchObject({ soporte: 5, soporteRelativo: 0.5 });
    expect(ab?.cestas).toEqual(['ab-0', 'ab-1', 'ab-2', 'ab-3', 'ab-4']);
  });
});

/* ------------------------------------------------------------------ */
/* generarReglas                                                       */
/* ------------------------------------------------------------------ */

describe('generarReglas', () => {
  it('no genera reglas sin cestas', () => {
    expect(generarReglas([])).toEqual([]);
  });

  it('no genera reglas si cada cesta tiene un único ítem', () => {
    const cestas = [...repetir('a', 10, ['a']), ...repetir('b', 10, ['b'])];
    expect(generarReglas(cestas, { soporteMinimo: 3 })).toEqual([]);
  });

  it('calcula confianza y lift con los valores exactos del caso a mano', () => {
    /* 5 cestas {a,b} · 1 cesta {a,c} · 4 cestas {c,d} ⇒ soporte(a)=6,
     * soporte(b)=5, soporte(a,b)=5 sobre 10 cestas. */
    const cestas = [
      ...repetir('ab', 5, ['a', 'b']),
      ...repetir('ac', 1, ['a', 'c']),
      ...repetir('cd', 4, ['c', 'd']),
    ];
    const reglas = generarReglas(cestas, { soporteMinimo: 3 });
    const aHaciaB = reglas.find((r) => r.antecedente.join() === 'a' && r.consecuente === 'b');

    expect(aHaciaB?.soporte).toBe(5);
    expect(aHaciaB?.confianza).toBeCloseTo(5 / 6, 10);
    expect(aHaciaB?.lift).toBeCloseTo(5 / 3, 10);
    expect(aHaciaB?.cestas).toHaveLength(5);
  });

  it('descarta las reglas con lift = 1 (independencia estadística)', () => {
    /* `b` está en las 10 cestas: saber que hay `a` no aporta nada sobre `b`,
     * así que la confianza es 1 pero el lift es exactamente 1. */
    const cestas = [...repetir('ab', 8, ['a', 'b']), ...repetir('b', 2, ['b'])];

    const conUmbral = generarReglas(cestas, { soporteMinimo: 3 });
    expect(conUmbral.some((r) => r.consecuente === 'b')).toBe(false);

    /* Bajando el umbral de lift la regla aparece, lo que prueba que quien la
     * filtraba era el lift y no la confianza ni el soporte. */
    const sinUmbral = generarReglas(cestas, { soporteMinimo: 3, liftMinimo: 1 });
    const aHaciaB = sinUmbral.find((r) => r.antecedente.join() === 'a' && r.consecuente === 'b');
    expect(aHaciaB?.confianza).toBe(1);
    expect(aHaciaB?.lift).toBe(1);
  });

  it('descarta las reglas por debajo de la confianza mínima', () => {
    /* P(b | a) = 3/6 = 0,5 < 0,6 aunque el lift sea alto. */
    const cestas = [
      ...repetir('ab', 3, ['a', 'b']),
      ...repetir('ac', 3, ['a', 'c']),
      ...repetir('cd', 14, ['c', 'd']),
    ];
    const reglas = generarReglas(cestas, { soporteMinimo: 3 });
    expect(reglas.some((r) => r.antecedente.join() === 'a' && r.consecuente === 'b')).toBe(false);

    const relajadas = generarReglas(cestas, { soporteMinimo: 3, confianzaMinima: 0.5 });
    expect(relajadas.some((r) => r.antecedente.join() === 'a' && r.consecuente === 'b')).toBe(true);
  });

  it('descubre en el top el patrón plantado bajo ruido aleatorio', () => {
    const reglas = generarReglas(datasetConPatronPlantado(), OPCIONES_APRIORI);
    expect(reglas.length).toBeGreaterThan(0);

    const mejor = reglas[0];
    expect(mejor.antecedente).toEqual(['linea=L2', 'turno=N']);
    expect(mejor.consecuente).toBe('causa=C5');
    expect(mejor.soporte).toBe(90);
    expect(mejor.confianza).toBeGreaterThan(0.6);
    expect(mejor.lift).toBeGreaterThan(2);
  });

  it('el patrón plantado no se ve con un solo ítem en el antecedente', () => {
    /* Es la razón de ser de Apriori: la asociación sólo emerge al combinar
     * línea y turno; por separado ninguna de las dos llega al umbral. */
    const cestas = datasetConPatronPlantado();
    const reglas = generarReglas(cestas, { ...OPCIONES_APRIORI, tamanoMaximoItemset: 2 });
    expect(reglas.some((r) => r.consecuente === 'causa=C5' && r.antecedente.length === 1)).toBe(
      false,
    );
  });

  it('nunca devuelve un antecedente mayor que `tamanoMaximoItemset - 1`', () => {
    const reglas = generarReglas(datasetConPatronPlantado(), OPCIONES_APRIORI);
    expect(Math.max(...reglas.map((r) => r.antecedente.length))).toBeLessThanOrEqual(2);
  });

  it('es determinista: dos ejecuciones devuelven exactamente el mismo orden', () => {
    const cestas = datasetConPatronPlantado();
    const primera = generarReglas(cestas, OPCIONES_APRIORI);
    const segunda = generarReglas(cestas, OPCIONES_APRIORI);
    expect(segunda).toEqual(primera);
  });
});
