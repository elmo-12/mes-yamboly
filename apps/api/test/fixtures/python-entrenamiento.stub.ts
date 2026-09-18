import type { ObjetivoModelo } from '../../src/database/entities';
import type {
  EntrenarRequest,
  EntrenarResponse,
  ModeloActualPy,
  ResultadoClasificacionPy,
  SaludPy,
  WalkForwardPy,
} from '../../src/modules/analytics/modelado';

/**
 * Reemplazo determinista de `PythonEntrenamientoClient` para los e2e (F5,
 * apartado 5): `apps/api/test/setup-e2e.ts` deja `PREDICTION_SERVICE_URL`
 * vacía a propósito (sin Docker, sin Python de verdad), así que la única
 * forma de probar el camino **feliz** del orquestador de principio a fin —
 * incluida la verificación de pliegues del contrato Python §3 — es
 * sustituir el cliente HTTP por este stub vía `overrideProvider` en el
 * `Test.createTestingModule` de la suite que lo necesite.
 *
 * Por defecto **ecoa** los `pliegues[]` que Nest mandó en la petición: es lo
 * que hace que la verificación anti off-by-one de
 * `EntrenamientoContinuoService` pase. `forzarPliegues()` permite el caso
 * negativo a propósito (pliegues que no coinciden → la corrida se descarta).
 */
export class PythonEntrenamientoClientStub {
  peticiones: EntrenarRequest[] = [];
  private plieguesForzados: ResultadoClasificacionPy['pliegues'] | null = null;
  private walkForward: WalkForwardPy = {
    aucRoc: 0.82,
    prAuc: 0.72,
    f1: 0.62,
    precision: 0.58,
    recall: 0.66,
    brier: 0.14,
    vp: 45,
    fp: 18,
    vn: 110,
    fn: 27,
    umbral: 0.42,
  };
  private modeloVersion: string | null = null;

  /** Fuerza que la respuesta declare unos pliegues distintos a los pedidos (test negativo). */
  forzarPliegues(pliegues: ResultadoClasificacionPy['pliegues']): void {
    this.plieguesForzados = pliegues;
  }

  /** Cambia las métricas del walk-forward que devuelve el candidato (para forzar una decisión). */
  fijarWalkForward(walkForward: Partial<WalkForwardPy>): void {
    this.walkForward = { ...this.walkForward, ...walkForward };
  }

  get disponible(): boolean {
    return true;
  }

  async salud(): Promise<SaludPy> {
    return { estado: 'ok', modeloCargado: true, version: this.modeloVersion ?? 'stub', sklearn: '1.5', uptimeS: 42 };
  }

  async modeloActual(): Promise<ModeloActualPy | null | undefined> {
    if (!this.modeloVersion) return null;
    return {
      version: this.modeloVersion,
      objetivo: 'parada_imprevista',
      algoritmo: 'LightGBM 4.5 (stub)',
      hiperparametros: {},
      nombres: [],
      entrenadoEn: new Date().toISOString(),
      artefactoSha256: 'sha-stub',
      umbralDecisionPct: this.walkForward.umbral * 100,
    };
  }

  async entrenar(cuerpo: EntrenarRequest): Promise<EntrenarResponse> {
    this.peticiones.push(cuerpo);
    const resultado: ResultadoClasificacionPy = {
      algoritmo: 'LightGBM 4.5 (stub)',
      hiperparametros: { learning_rate: 0.05, num_leaves: 31 },
      muestras: cuerpo.muestras.length,
      features: cuerpo.catalogo.length,
      tasaPositivos: 0.33,
      walkForward: this.walkForward,
      aucPrueba: this.walkForward.aucRoc - 0.02,
      aucRetro: Math.min(0.99, this.walkForward.aucRoc + 0.1),
      liftTop3: 1.5,
      corteEntrenamiento: cuerpo.evaluacion.pruebaDesde,
      cortePrueba: cuerpo.snapshot.hasta,
      pliegues: this.plieguesForzados ?? cuerpo.evaluacion.pliegues,
      importancias: cuerpo.catalogo.slice(0, 5).map((c, i) => ({ nombre: c.nombre, importancia: 100 - i * 15 })),
      fuera: [],
      alternativas: [{ algoritmo: 'HistGradientBoosting', prAuc: this.walkForward.prAuc - 0.05 }],
      campeonReevaluado: cuerpo.campeon
        ? { version: cuerpo.campeon.version, walkForward: { ...this.walkForward, prAuc: this.walkForward.prAuc - 0.08 } }
        : null,
      artefacto: { uri: `modelos/parada_imprevista/${cuerpo.version}.joblib`, sha256: `sha-${cuerpo.version}`, bytes: 123_456 },
    };
    return {
      runId: `TRAIN-${cuerpo.version}`,
      resultados: { parada_imprevista: resultado },
      duracionMs: 1500,
    };
  }

  async activar(_objetivo: ObjetivoModelo, version: string): Promise<void> {
    this.modeloVersion = version;
  }

  async desactivar(_objetivo: ObjetivoModelo): Promise<void> {
    this.modeloVersion = null;
  }
}
