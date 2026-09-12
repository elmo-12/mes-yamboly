import {
  contribuciones,
  entrenarLogistica,
  importanciaRelativa,
  predecirLote,
  predecirProba,
  sigmoide,
} from './regresion-logistica';
import { auc, brier, evaluar, liftTopK, matrizConfusion, umbralOptimoF1 } from './metricas';

/**
 * Dataset sintético con separación conocida: la clase depende sólo de `x1`
 * (positiva cuando `x1 > 0`), `x2` es ruido determinista y `x3` una columna
 * constante. Si el entrenador funciona, el coeficiente de `x1` domina y el
 * clasificador separa perfectamente.
 */
function datasetSeparable(n = 200): { X: number[][]; y: number[]; nombres: string[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const x1 = (i % 2 === 0 ? 1 : -1) * (1 + (i % 7) * 0.3);
    const x2 = ((i * 37) % 11) - 5;
    X.push([x1, x2, 1]);
    y.push(x1 > 0 ? 1 : 0);
  }
  return { X, y, nombres: ['x1', 'x2', 'constante'] };
}

describe('regresión logística L2', () => {
  const { X, y, nombres } = datasetSeparable();

  it('sigmoide es estable en los extremos', () => {
    expect(sigmoide(0)).toBeCloseTo(0.5, 10);
    expect(sigmoide(800)).toBe(1);
    expect(sigmoide(-800)).toBe(0);
  });

  it('separa un dataset linealmente separable', () => {
    const modelo = entrenarLogistica(X, y, nombres, { iteraciones: 800 });
    const p = predecirLote(modelo, X);
    const m = matrizConfusion(y, p, 0.5);
    expect(m.fp + m.fn).toBe(0);
    expect(auc(y, p)).toBeCloseTo(1, 5);
    expect(brier(y, p)).toBeLessThan(0.05);
  });

  it('da toda la importancia a la variable informativa', () => {
    const modelo = entrenarLogistica(X, y, nombres, { iteraciones: 800 });
    const importancias = importanciaRelativa(modelo);
    expect(importancias[0]!.nombre).toBe('x1');
    expect(importancias[0]!.importancia).toBe(100);
    /* `x2` es ruido y `constante` no varía: ninguna puede pesar como `x1`. */
    expect(importancias[1]!.importancia).toBeLessThan(20);
  });

  it('es determinista entre corridas', () => {
    const a = entrenarLogistica(X, y, nombres);
    const b = entrenarLogistica(X, y, nombres);
    expect(b.pesos).toEqual(a.pesos);
    expect(b.sesgo).toBe(a.sesgo);
  });

  it('la regularización encoge los coeficientes', () => {
    const suave = entrenarLogistica(X, y, nombres, { lambdaL2: 0.01 });
    const fuerte = entrenarLogistica(X, y, nombres, { lambdaL2: 5000 });
    expect(Math.abs(fuerte.pesos[0]!)).toBeLessThan(Math.abs(suave.pesos[0]!));
  });

  it('reparte contribuciones coherentes con la muestra puntuada', () => {
    const modelo = entrenarLogistica(X, y, nombres, { iteraciones: 800 });
    const positiva = contribuciones(modelo, [3, 0, 1]);
    expect(positiva[0]!.nombre).toBe('x1');
    expect(positiva[0]!.contribucion).toBeGreaterThan(0);
    expect(predecirProba(modelo, [3, 0, 1])).toBeGreaterThan(0.9);
    expect(predecirProba(modelo, [-3, 0, 1])).toBeLessThan(0.1);
  });

  it('aprende la clase minoritaria pese al desbalance', () => {
    /* 10 % de positivos: sin ponderación de clase el modelo trivial «todo 0»
     * tendría 90 % de exactitud y recall 0. */
    const Xd: number[][] = [];
    const yd: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const positivo = i % 10 === 0;
      Xd.push([positivo ? 2 : -1, i % 5]);
      yd.push(positivo ? 1 : 0);
    }
    const modelo = entrenarLogistica(Xd, yd, ['x1', 'x2']);
    const p = predecirLote(modelo, Xd);
    const m = matrizConfusion(yd, p, umbralOptimoF1(yd, p));
    expect(m.vp).toBe(20);
    expect(m.fn).toBe(0);
  });
});

describe('métricas de evaluación', () => {
  it('AUC vale 0,5 con probabilidades constantes y 1 con orden perfecto', () => {
    expect(auc([1, 0, 1, 0], [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(0.5, 10);
    expect(auc([1, 1, 0, 0], [0.9, 0.8, 0.2, 0.1])).toBeCloseTo(1, 10);
    expect(auc([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1])).toBeCloseTo(0, 10);
  });

  it('el umbral óptimo mejora el F1 frente al 0,5 por defecto', () => {
    const y = [1, 1, 1, 0, 0, 0, 0, 0];
    const p = [0.45, 0.4, 0.35, 0.3, 0.2, 0.1, 0.05, 0.02];
    const optimo = umbralOptimoF1(y, p);
    expect(optimo).toBeLessThan(0.5);
    expect(evaluar(y, p, optimo).f1).toBeGreaterThan(evaluar(y, p, 0.5).f1);
  });

  it('lift@top-3 supera 1 cuando el ranking acierta', () => {
    const filas = [
      { clave: 'd1', y: 1, p: 0.9 },
      { clave: 'd1', y: 1, p: 0.8 },
      { clave: 'd1', y: 1, p: 0.7 },
      { clave: 'd1', y: 0, p: 0.2 },
      { clave: 'd1', y: 0, p: 0.1 },
      { clave: 'd1', y: 0, p: 0.05 },
    ];
    expect(liftTopK(filas, 3)).toBeCloseTo(2, 5);
  });
});
