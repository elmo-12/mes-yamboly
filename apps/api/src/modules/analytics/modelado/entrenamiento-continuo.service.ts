import { createHash } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, MoreThanOrEqual, Repository, type QueryRunner } from 'typeorm';
import { ahoraIso, hoyIso } from '../../../common/utils';
import { ConflictoException } from '../../../common/exceptions';
import {
  Alerta,
  EntrenamientoEjecucion,
  ModeloVersion,
  type DecisionPromocion,
  type DisparadorEntrenamiento,
  type EstadoEjecucion,
  type PerfilDatos,
  type ResultadoObjetivoEjecucion,
} from '../../../database/entities';
import { catalogoAnticipado, nombresRetrospectivos, DatasetBuilderService, type MuestraCalculada } from '../dataset';
import {
  ENTRENAMIENTO_CRON_DEFECTO,
  AUC_MINIMA,
  BRIER_MAX_EMPEORAMIENTO,
  DELTA_PR_AUC_MINIMO,
  HUERFANA_TIMEOUT_MS,
  LOCK_ENTRENAMIENTO_CONTINUO,
  MIN_MUESTRAS,
  MIN_NEGATIVOS_PRUEBA,
  MIN_POSITIVOS_PRUEBA,
  OBJETIVOS_CLASIFICACION,
  OBJETIVOS_MODELO,
  OBJETIVO_PERSISTIDO,
  RECALL_MAX_EMPEORAMIENTO,
  SALUD_TIMEOUT_MS,
  SEMILLA_ENTRENAMIENTO,
  entrenamientoContinuoActivo,
} from './entrenamiento-continuo.constants';
import { EntrenamientoService } from './entrenamiento.service';
import {
  FRACCION_PRUEBA,
  PLIEGUES,
  cortesTemporales,
  pliegues as construirPliegues,
  type PliegueEvaluacion,
  type ProbabilidadFuera,
} from './evaluacion.service';
import { EvaluacionService } from './evaluacion.service';
import {
  PythonEntrenamientoClient,
  PythonEntrenamientoError,
  type EntrenarRequest,
  type EntrenarResponse,
  type MuestraEntrenamientoPy,
  type PliegueEvaluacionPy,
  type ResultadoClasificacionPy,
  type ResultadoFalloPy,
  type ResultadoMulticlasePy,
  type ResultadoObjetivoPy,
  type ResultadoRegresionPy,
  type WalkForwardPy,
} from './python-entrenamiento.client';

interface DecisionResultado {
  decision: DecisionPromocion;
  motivo: string;
  metricas?: Record<string, number>;
}

function fmt(valor: number, decimales = 3): string {
  return Number.isFinite(valor) ? valor.toFixed(decimales) : String(valor);
}

/** Bloque de objetivo que Python no pudo entrenar (contrato §3.3). */
function esFallo(resultado: ResultadoObjetivoPy): resultado is ResultadoFalloPy {
  return 'error' in resultado && typeof (resultado as ResultadoFalloPy).error === 'string';
}

function esClasificacion(resultado: ResultadoObjetivoPy): resultado is ResultadoClasificacionPy {
  return !esFallo(resultado) && 'walkForward' in resultado;
}

function esRegresion(resultado: ResultadoObjetivoPy): resultado is ResultadoRegresionPy {
  return !('walkForward' in resultado) && 'mae' in (resultado as ResultadoRegresionPy).metricas;
}

/**
 * Champion/challenger de un objetivo binario. La comparación es contra
 * `campeonReevaluado` —el incumbente puntuado sobre el mismo snapshot— nunca
 * contra la métrica archivada: la definición del target puede haber cambiado
 * entre semanas (§6, doc congelado) y comparar contra un número viejo
 * promovería por una mejora que no es tal.
 */
export function decidirClasificacion(
  candidato: WalkForwardPy,
  incumbente: WalkForwardPy | null,
  incumbenteVersion: string | null,
  muestrasTotal: number,
): DecisionResultado {
  const metricas = metricasClasificacion(candidato);
  if (muestrasTotal < MIN_MUESTRAS) {
    return { decision: 'incumbente', motivo: `Muestras insuficientes (${muestrasTotal} < ${MIN_MUESTRAS})`, metricas };
  }
  if (candidato.aucRoc < AUC_MINIMA) {
    return {
      decision: 'incumbente',
      motivo: `ROC-AUC ${fmt(candidato.aucRoc)} por debajo del mínimo ${AUC_MINIMA}`,
      metricas,
    };
  }
  const positivos = candidato.vp + candidato.fn;
  const negativos = candidato.vn + candidato.fp;
  if (positivos < MIN_POSITIVOS_PRUEBA || negativos < MIN_NEGATIVOS_PRUEBA) {
    return {
      decision: 'incumbente',
      motivo: `Prueba con pocos casos (${positivos} positivos, ${negativos} negativos; mínimo ${MIN_POSITIVOS_PRUEBA}/${MIN_NEGATIVOS_PRUEBA})`,
      metricas,
    };
  }
  if (!incumbente) {
    return { decision: 'sin_incumbente', motivo: 'Primer modelo del objetivo: se promueve sin comparación', metricas };
  }
  const deltaPrAuc = candidato.prAuc - incumbente.prAuc;
  const deltaBrier = candidato.brier - incumbente.brier;
  const deltaRecall = candidato.recall - incumbente.recall;
  const mejora = deltaPrAuc >= DELTA_PR_AUC_MINIMO && deltaBrier <= BRIER_MAX_EMPEORAMIENTO && deltaRecall >= -RECALL_MAX_EMPEORAMIENTO;
  const version = incumbenteVersion ?? 'el campeón';
  if (mejora) {
    return {
      decision: 'promovido',
      motivo: `Mejora a ${version}: PR-AUC ${fmt(candidato.prAuc)} vs ${fmt(incumbente.prAuc)} (Δ${fmt(deltaPrAuc)}), Brier ${fmt(candidato.brier, 4)} vs ${fmt(incumbente.brier, 4)}, recall ${fmt(candidato.recall * 100, 1)} % vs ${fmt(incumbente.recall * 100, 1)} %`,
      metricas,
    };
  }
  /* El motivo tiene que nombrar **la puerta que bloqueó**, no sólo la primera.
   * Antes siempre citaba PR-AUC, así que un rechazo por calibración o por
   * recall se leía como si PR-AUC hubiera fallado —incluso cuando la había
   * superado con holgura—, y parecía un bug de la comparación. */
  const fallos: string[] = [];
  if (deltaPrAuc < DELTA_PR_AUC_MINIMO) {
    fallos.push(`PR-AUC ${fmt(candidato.prAuc)} vs ${fmt(incumbente.prAuc)} (Δ${fmt(deltaPrAuc)}, mínimo Δ${DELTA_PR_AUC_MINIMO})`);
  }
  if (deltaBrier > BRIER_MAX_EMPEORAMIENTO) {
    fallos.push(
      `Brier empeora ${fmt(incumbente.brier, 4)} → ${fmt(candidato.brier, 4)} (Δ${fmt(deltaBrier, 4)}, máximo ${BRIER_MAX_EMPEORAMIENTO})`,
    );
  }
  if (deltaRecall < -RECALL_MAX_EMPEORAMIENTO) {
    fallos.push(
      `recall cae ${fmt(incumbente.recall * 100, 1)} % → ${fmt(candidato.recall * 100, 1)} % (máximo ${RECALL_MAX_EMPEORAMIENTO * 100} pp)`,
    );
  }
  return {
    decision: 'incumbente',
    motivo: `No mejora a ${version}: ${fallos.join('; ')}`,
    metricas,
  };
}

/** Regresión (`minutos_imprevistos`): RMSE más bajo gana; sin AUC ni guardarraíl de clases. */
export function decidirRegresion(
  candidato: { mae: number; rmse: number; r2: number },
  incumbente: { mae: number; rmse: number; r2: number } | null,
  incumbenteVersion: string | null,
): DecisionResultado {
  const metricas = { mae: candidato.mae, rmse: candidato.rmse, r2: candidato.r2 };
  if (!incumbente) return { decision: 'sin_incumbente', motivo: 'Primer modelo del objetivo: se promueve sin comparación', metricas };
  const version = incumbenteVersion ?? 'el campeón';
  if (candidato.rmse < incumbente.rmse) {
    return { decision: 'promovido', motivo: `RMSE ${fmt(candidato.rmse)} mejora a ${version} (${fmt(incumbente.rmse)})`, metricas };
  }
  return { decision: 'incumbente', motivo: `RMSE ${fmt(candidato.rmse)} no mejora a ${version} (${fmt(incumbente.rmse)})`, metricas };
}

/** Multiclase (`causa_dominante`): F1-macro más alto gana. */
export function decidirMulticlase(
  candidato: { f1Macro: number; accuracy: number; top2: number },
  incumbente: { f1Macro: number; accuracy: number; top2: number } | null,
  incumbenteVersion: string | null,
): DecisionResultado {
  const metricas = { f1Macro: candidato.f1Macro, accuracy: candidato.accuracy, top2: candidato.top2 };
  if (!incumbente) return { decision: 'sin_incumbente', motivo: 'Primer modelo del objetivo: se promueve sin comparación', metricas };
  const version = incumbenteVersion ?? 'el campeón';
  if (candidato.f1Macro > incumbente.f1Macro) {
    return { decision: 'promovido', motivo: `F1-macro ${fmt(candidato.f1Macro)} mejora a ${version} (${fmt(incumbente.f1Macro)})`, metricas };
  }
  return { decision: 'incumbente', motivo: `F1-macro ${fmt(candidato.f1Macro)} no mejora a ${version} (${fmt(incumbente.f1Macro)})`, metricas };
}

function metricasClasificacion(wf: WalkForwardPy): Record<string, number> {
  return { aucRoc: wf.aucRoc, prAuc: wf.prAuc, f1: wf.f1, precision: wf.precision, recall: wf.recall, brier: wf.brier };
}

/** JSON canónico (claves ordenadas, recursivo): dos objetos con las mismas claves dan el mismo hash. */
function canonicalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalizar(v)]),
    );
  }
  return valor;
}

/**
 * SHA-256 del snapshot de muestras que se manda a Python.
 *
 * La regla está fijada en `docs/prediccion-python.md` §3.1 y **los dos lados
 * tienen que aplicarla al pie de la letra** o todo entrenamiento se rechaza con
 * 422: se hashea el array `muestras` **en el mismo orden en que viaja en el
 * cuerpo** (no se reordenan las filas: reordenarlas aquí y enviar otro orden
 * garantizaba el fallo), con las claves de cada objeto ordenadas
 * alfabéticamente en todos los niveles y sin espacios.
 *
 * `JSON.stringify` ya emite compacto y sin escapar no-ASCII, que es el
 * equivalente exacto de `separators=(',',':')` + `ensure_ascii=False` en
 * Python. El vector dorado de `calcularSnapshotSha256.spec.ts` está replicado
 * en `tests/test_snapshot_sha256.py`: si alguien cambia un lado, falla el otro.
 */
export function calcularSnapshotSha256(muestras: readonly MuestraEntrenamientoPy[]): string {
  return createHash('sha256').update(JSON.stringify(canonicalizar(muestras)), 'utf8').digest('hex');
}

function pliegueArraysIguales(propios: readonly PliegueEvaluacion[], recibidos: readonly PliegueEvaluacionPy[]): boolean {
  if (propios.length !== recibidos.length) return false;
  return propios.every(
    (p, i) =>
      p.entrenamientoHasta === recibidos[i]!.entrenamientoHasta &&
      p.validacionDesde === recibidos[i]!.validacionDesde &&
      p.validacionHasta === recibidos[i]!.validacionHasta,
  );
}

/**
 * Orquestador de entrenamiento continuo (bloque B del plan de IA): la
 * frontera entre `DatasetBuilderService` (features) y `services/prediccion-py`
 * (modelos). Lo dispara el cron semanal, el botón «Reentrenar» o el arranque
 * en frío, y en los tres casos corre exactamente el mismo camino:
 *
 * `lock → limpiar huérfanas → reconstruir dataset (snapshot) → GET /salud →
 * POST /entrenar → verificar pliegues → decidir champion/challenger por
 * objetivo → persistir modelo_version → activar en Python → backtest →
 * verificar GET /modelo/actual → registrar la ejecución`.
 *
 * Sólo `parada_imprevista` (`OBJETIVO_PERSISTIDO`) se escribe en
 * `modelo_version`: es el único objetivo que `/predict` consume. Los otros
 * tres (`merma_sobre_estandar`, `minutos_imprevistos`, `causa_dominante`) se
 * entrenan y se deciden igual, pero su versión activa vive sólo en el
 * registro propio de Python — Nest no tiene hoy una pantalla que la consuma.
 */
@Injectable()
export class EntrenamientoContinuoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EntrenamientoContinuoService.name);
  private lockRunner?: QueryRunner;

  constructor(
    private readonly dataSource: DataSource,
    private readonly dataset: DatasetBuilderService,
    private readonly evaluacion: EvaluacionService,
    private readonly entrenamientoService: EntrenamientoService,
    private readonly python: PythonEntrenamientoClient,
    @InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>,
    @InjectRepository(EntrenamientoEjecucion) private readonly ejecuciones: Repository<EntrenamientoEjecucion>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
  ) {}

  /** Limpia entrenamientos huérfanos y reconcilia la vigente con lo que Python dice tener activo. */
  async onApplicationBootstrap(): Promise<void> {
    await this.limpiarHuerfanas().catch((error: unknown) =>
      this.logger.error(`Limpieza de huérfanas en el arranque falló: ${(error as Error).message}`),
    );
    await this.reconciliarConPython().catch((error: unknown) =>
      this.logger.error(`Reconciliación con Python en el arranque falló: ${(error as Error).message}`),
    );
  }

  /**
   * Cron semanal (`ENTRENAMIENTO_CRON`, por defecto lunes 03:00). Sólo actúa
   * si `ENTRENAMIENTO_ACTIVO=true`: es opt-in a propósito, a diferencia de la
   * inferencia. **Nota:** la expresión del decorador es la de por defecto —
   * hacerla leer `ENTRENAMIENTO_CRON` en caliente requeriría
   * `SchedulerRegistry` (fuera de alcance de esta pasada); el flag de
   * activación sí se respeta en cada disparo.
   */
  @Cron(ENTRENAMIENTO_CRON_DEFECTO, { name: 'entrenamiento-continuo' })
  async cron(): Promise<void> {
    if (!entrenamientoContinuoActivo()) return;
    await this.ejecutar('cron').catch((error: unknown) =>
      this.logger.error(`Entrenamiento continuo (cron) falló: ${(error as Error).message}`),
    );
  }

  /**
   * Punto de entrada único del orquestador. Lanza 409 (`ConflictoException`)
   * si ya hay un entrenamiento en curso (lock no adquirido); cualquier otro
   * desenlace queda como una fila `entrenamiento_ejecucion` con `estado`
   * `completado` | `omitido` | `error`.
   */
  async ejecutar(disparador: DisparadorEntrenamiento): Promise<EntrenamientoEjecucion> {
    await this.limpiarHuerfanas();

    const bloqueado = await this.adquirirLock();
    if (!bloqueado) throw new ConflictoException('Ya hay un reentrenamiento en curso');

    const inicioMs = Date.now();
    const iniciadoEn = ahoraIso();

    try {
      const version = await this.entrenamientoService.siguienteVersion();
      let ejecucion = await this.ejecuciones.save(
        this.ejecuciones.create({
          id: `EJEC-${version.replace(/\./g, '')}-${Date.now()}`,
          disparador,
          estado: 'en_curso' as EstadoEjecucion,
          version,
          objetivo: OBJETIVO_PERSISTIDO,
          iniciadoEn,
          muestras: 0,
        }),
      );

      const fila = await this.versiones.save(
        this.versiones.create({
          version,
          objetivo: OBJETIVO_PERSISTIDO,
          estado: 'entrenando',
          entrenadoEn: hoyIso(),
          iniciadoEn,
          orden: -1,
        }),
      );

      const terminar = async (
        estado: EstadoEjecucion,
        detalle: { decision?: DecisionPromocion; motivo?: string; error?: string; resultados?: ResultadoObjetivoEjecucion[] },
      ): Promise<EntrenamientoEjecucion> => {
        ejecucion.estado = estado;
        ejecucion.finalizadoEn = ahoraIso();
        ejecucion.duracionMs = Date.now() - inicioMs;
        ejecucion.decision = detalle.decision ?? null;
        ejecucion.motivo = detalle.motivo ?? null;
        ejecucion.error = detalle.error ?? null;
        ejecucion.resultados = detalle.resultados ?? null;
        ejecucion = await this.ejecuciones.save(ejecucion);
        return ejecucion;
      };

      /* Para entrenar basta con que Python **responda**. `estado: 'degradado'`
       * sólo significa «no tengo modelo cargado, no puedo servir /predict», que
       * es precisamente el estado normal antes del primer entrenamiento
       * (`docs/prediccion-python.md` §4). Exigir `'ok'` aquí creaba un bloqueo
       * circular: no se podía entrenar el primer modelo porque aún no había
       * ningún modelo. Sólo se omite la corrida si no contesta. */
      const salud = await this.python.salud(SALUD_TIMEOUT_MS);
      if (!salud) {
        const motivo = 'Python no respondió a GET /salud a tiempo: no hay fallback de entrenamiento local';
        await this.archivarFila(fila, motivo);
        this.logger.warn(motivo);
        return terminar('omitido', { error: motivo, motivo });
      }
      if (salud.estado === 'degradado') {
        this.logger.log('Python responde en estado degradado (sin modelo aún): se entrena el primero');
      }

      const { muestras, catalogo, perfil } = await this.dataset.reconstruir();
      const anticipadas = muestras.filter((m) => m.modo === 'anticipado');
      ejecucion.muestras = anticipadas.length;

      if (anticipadas.length < MIN_MUESTRAS) {
        const motivo = `Sólo hay ${anticipadas.length} muestras «anticipado»; se necesitan ${MIN_MUESTRAS}`;
        await this.archivarFila(fila, motivo);
        return terminar('error', { error: motivo, motivo });
      }

      const dias = [...new Set(anticipadas.map((m) => m.fecha))].sort();
      const pliegesEsperados = construirPliegues(dias, PLIEGUES);
      const { pruebaDesde } = cortesTemporales(dias, FRACCION_PRUEBA);
      const muestrasPy = this.construirMuestrasPy(anticipadas);
      const snapshotSha256 = calcularSnapshotSha256(muestrasPy);

      /* Sólo es campeón reevaluable una versión que Python pueda reconstruir:
       * necesita `proveedor='python-gbm'` y su `algoritmo`. Una fila heredada
       * del entrenador TS retirado no tiene artefacto en Python ni familia de
       * estimador equivalente, así que se manda `null` y la corrida se juzga
       * contra los guardarraíles absolutos (`docs/prediccion-python.md` §3.2). */
      const vigente = await this.versiones.findOne({ where: { estado: 'vigente', objetivo: OBJETIVO_PERSISTIDO } });
      const campeon = vigente?.proveedor === 'python-gbm' && vigente.algoritmo ? vigente : null;

      const peticion: EntrenarRequest = {
        version,
        objetivos: [...OBJETIVOS_MODELO],
        snapshot: { sha256: snapshotSha256, filas: anticipadas.length, desde: dias[0] ?? '', hasta: dias.at(-1) ?? '' },
        catalogo: catalogoAnticipado(catalogo).map((c) => ({ nombre: c.nombre, grupo: c.grupo, etiqueta: c.etiqueta })),
        prohibidas: nombresRetrospectivos(),
        evaluacion: { pruebaDesde, pliegues: pliegesEsperados },
        muestras: muestrasPy,
        campeon: campeon
          ? {
              version: campeon.version,
              algoritmo: campeon.algoritmo,
              hiperparametros: campeon.hiperparametros ?? {},
            }
          : null,
        semilla: SEMILLA_ENTRENAMIENTO,
      };

      let respuesta: EntrenarResponse;
      try {
        respuesta = await this.python.entrenar(peticion);
      } catch (error: unknown) {
        const motivo =
          error instanceof PythonEntrenamientoError
            ? `Python rechazó el entrenamiento (HTTP ${error.status ?? '—'}): ${this.mensajePython(error)}`
            : `Fallo al llamar a POST /entrenar: ${(error as Error).message}`;
        await this.archivarFila(fila, motivo);
        return terminar('error', { error: motivo, motivo });
      }

      /* Guardarraíl anti off-by-one (§3): los pliegues que Python dice haber
       * usado tienen que ser exactamente los que Nest mandó. */
      for (const objetivo of OBJETIVOS_CLASIFICACION) {
        const resultado = respuesta.resultados[objetivo];
        if (!resultado || !esClasificacion(resultado)) continue;
        if (!pliegueArraysIguales(pliegesEsperados, resultado.pliegues)) {
          const motivo = `Pliegues devueltos por Python no coinciden con los de Nest para «${objetivo}»: se descarta la corrida entera`;
          await this.archivarFila(fila, motivo);
          this.logger.error(motivo);
          return terminar('error', { error: motivo, motivo });
        }
      }

      const resultadosPorObjetivo: ResultadoObjetivoEjecucion[] = [];
      let decisionPrincipal: DecisionPromocion = 'no_evaluado';
      let motivoPrincipal = 'Python no devolvió resultado para el objetivo principal';

      for (const objetivo of OBJETIVOS_MODELO) {
        const resultado = respuesta.resultados[objetivo];
        if (!resultado) {
          resultadosPorObjetivo.push({ objetivo, decision: 'no_evaluado', motivo: 'Python no devolvió resultado para este objetivo' });
          continue;
        }
        /* Objetivo aislado que Python no pudo entrenar: se registra su motivo
         * real y se sigue con el resto (contrato §3.3). */
        if (esFallo(resultado)) {
          resultadosPorObjetivo.push({ objetivo, decision: 'no_evaluado', motivo: `Python no pudo entrenarlo: ${resultado.error}` });
          if (objetivo === OBJETIVO_PERSISTIDO) {
            decisionPrincipal = 'no_evaluado';
            motivoPrincipal = `Python no pudo entrenar «${objetivo}»: ${resultado.error}`;
          }
          this.logger.warn(`Objetivo «${objetivo}» no entrenable: ${resultado.error}`);
          continue;
        }
        const decisionResultado = this.evaluarObjetivo(resultado, anticipadas.length);
        resultadosPorObjetivo.push({ objetivo, ...decisionResultado });
        if (objetivo === OBJETIVO_PERSISTIDO) {
          decisionPrincipal = decisionResultado.decision;
          motivoPrincipal = decisionResultado.motivo;
        }
      }

      const resultadoPrincipal = respuesta.resultados[OBJETIVO_PERSISTIDO];
      if (resultadoPrincipal && esClasificacion(resultadoPrincipal)) {
        await this.persistirYActivar(fila, version, resultadoPrincipal, decisionPrincipal, motivoPrincipal, perfil, snapshotSha256);
      } else {
        await this.archivarFila(fila, 'Python no devolvió un resultado de clasificación para parada_imprevista');
      }

      /* Los otros tres objetivos no tienen fila en Postgres: si se promueven,
       * el único rastro es la activación en el registro propio de Python. */
      for (const objetivo of OBJETIVOS_MODELO) {
        if (objetivo === OBJETIVO_PERSISTIDO) continue;
        const entrada = resultadosPorObjetivo.find((r) => r.objetivo === objetivo);
        if (entrada?.decision !== 'promovido' && entrada?.decision !== 'sin_incumbente') continue;
        await this.python.activar(objetivo, version).catch((error: unknown) =>
          this.logger.warn(`No se pudo activar ${objetivo} ${version} en Python: ${(error as Error).message}`),
        );
      }

      return terminar('completado', {
        decision: decisionPrincipal,
        motivo: motivoPrincipal,
        resultados: resultadosPorObjetivo,
      });
    } finally {
      await this.liberarLock();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Decisión champion/challenger                                      */
  /* ---------------------------------------------------------------- */

  private evaluarObjetivo(resultado: ResultadoObjetivoPy, muestrasTotal: number): DecisionResultado {
    if (esClasificacion(resultado)) {
      return decidirClasificacion(
        resultado.walkForward,
        resultado.campeonReevaluado?.walkForward ?? null,
        resultado.campeonReevaluado?.version ?? null,
        muestrasTotal,
      );
    }
    if (esRegresion(resultado)) {
      return decidirRegresion(resultado.metricas, resultado.campeonReevaluado?.metricas ?? null, resultado.campeonReevaluado?.version ?? null);
    }
    const multiclase = resultado as ResultadoMulticlasePy;
    return decidirMulticlase(multiclase.metricas, multiclase.campeonReevaluado?.metricas ?? null, multiclase.campeonReevaluado?.version ?? null);
  }

  /* ---------------------------------------------------------------- */
  /* Persistencia (Nest es el único escritor de `modelo_version`)      */
  /* ---------------------------------------------------------------- */

  /**
   * Cuando el incumbente conserva la vigencia, su fila se actualiza con las
   * métricas **reevaluadas sobre el corpus de hoy**, no con las que se le
   * midieron el día que se entrenó.
   *
   * Sin esto, la pestaña Modelo —y cualquier cifra que se cite de ella— seguiría
   * publicando el AUC de un corpus que ya no existe: v1.5 se entrenó con 225
   * muestras y tras ampliar a 6 meses seguía anunciando «225 eventos · AUC
   * 0,582» aunque la decisión que la mantuvo vigente se tomó con sus métricas
   * sobre 1 131 muestras. La versión no cambia; cambia lo que se sabe de ella.
   */
  private async refrescarIncumbente(resultado: ResultadoClasificacionPy, perfil: PerfilDatos): Promise<void> {
    const reevaluado = resultado.campeonReevaluado;
    if (!reevaluado) return;
    const fila = await this.versiones.findOne({ where: { version: reevaluado.version } });
    if (!fila) return;

    const wf = reevaluado.walkForward;
    Object.assign(fila, {
      reevaluadoEn: ahoraIso(),
      eventos: resultado.muestras,
      features: resultado.features,
      auc: redondear(wf.aucRoc, 3),
      prAuc: redondear(wf.prAuc, 3),
      f1: redondear(wf.f1, 3),
      precision: redondear(wf.precision * 100, 1),
      recall: redondear(wf.recall * 100, 1),
      vp: wf.vp,
      fp: wf.fp,
      vn: wf.vn,
      fn: wf.fn,
      brier: redondear(wf.brier, 4),
      umbralDecision: redondear(wf.umbral * 100, 1),
      perfilDatos: perfil,
      snapshotSha256: fila.snapshotSha256,
    });
    await this.versiones.save(fila);
    this.logger.log(
      `${reevaluado.version} sigue vigente, métricas refrescadas sobre ${resultado.muestras} muestras: ` +
        `PR-AUC ${redondear(wf.prAuc, 3)} · recall ${redondear(wf.recall * 100, 1)} %`,
    );
  }

  private async persistirYActivar(
    fila: ModeloVersion,
    version: string,
    resultado: ResultadoClasificacionPy,
    decision: DecisionPromocion,
    motivo: string,
    perfil: PerfilDatos,
    snapshotSha256: string,
  ): Promise<void> {
    const wf = resultado.walkForward;
    const promovida = decision === 'promovido' || decision === 'sin_incumbente';

    Object.assign(fila, {
      entrenadoEn: hoyIso(),
      reevaluadoEn: ahoraIso(),
      eventos: resultado.muestras,
      auc: redondear(wf.aucRoc, 3),
      prAuc: redondear(wf.prAuc, 3),
      f1: redondear(wf.f1, 3),
      precision: redondear(wf.precision * 100, 1),
      recall: redondear(wf.recall * 100, 1),
      features: resultado.features,
      alertas30d: await this.contarAlertas30d(),
      algoritmo: resultado.algoritmo,
      hiperparametros: resultado.hiperparametros ?? null,
      objetivo: OBJETIVO_PERSISTIDO,
      proveedor: 'python-gbm' as const,
      coeficientes: null,
      umbralDecision: redondear(wf.umbral * 100, 1),
      vp: wf.vp,
      fp: wf.fp,
      vn: wf.vn,
      fn: wf.fn,
      brier: redondear(wf.brier, 4),
      liftTop3: resultado.liftTop3,
      aucPrueba: redondear(resultado.aucPrueba, 3),
      aucRetro: redondear(resultado.aucRetro, 3),
      corteEntrenamiento: resultado.corteEntrenamiento,
      cortePrueba: resultado.cortePrueba,
      importancias: resultado.importancias.map((im, i) => ({
        id: `VAR-${String(i + 1).padStart(2, '0')}`,
        nombre: im.nombre,
        importancia: im.importancia,
      })),
      perfilDatos: perfil,
      artefactoUri: resultado.artefacto?.uri ?? null,
      artefactoSha256: resultado.artefacto?.sha256 ?? null,
      snapshotSha256,
      promovida,
      razonPromocion: motivo,
      error: null,
      estado: promovida ? 'vigente' : 'archivada',
    });

    if (!promovida) {
      await this.versiones.save(fila);
      await this.refrescarIncumbente(resultado, perfil);
      this.logger.log(`${version} archivada (no promovida): ${motivo}`);
      return;
    }

    await this.versiones.save(fila);

    try {
      await this.python.activar(OBJETIVO_PERSISTIDO, version);
    } catch (error: unknown) {
      const mensaje = `Activación en Python falló tras promover ${version}: ${(error as Error).message}`;
      fila.error = mensaje;
      await this.versiones.save(fila);
      this.logger.error(mensaje);
      return;
    }

    /* Único escritor de `modelo_version`: archiva el resto y reordena. */
    await this.entrenamientoService.activar(version);

    const fuera: ProbabilidadFuera[] = resultado.fuera.map((f) => ({
      clave: `${f.lineaId}|${f.fecha}|${f.turno}`,
      lineaId: f.lineaId,
      lineaCodigo: f.lineaCodigo,
      fecha: f.fecha,
      turno: f.turno,
      y: f.y,
      p: f.p,
      minutosImprevistos: f.minutosImprevistos,
    }));
    await this.evaluacion.registrarBacktest(fuera, wf.umbral, version);

    const actual = await this.python.modeloActual();
    if (actual === null || (actual && actual.version !== version)) {
      this.logger.warn(
        `GET /modelo/actual no confirma ${version} tras activar (Python devolvió ${actual?.version ?? 'nada'})`,
      );
    }

    this.logger.log(`${version} vigente: ${motivo}`);
  }

  private construirMuestrasPy(anticipadas: readonly MuestraCalculada[]): MuestraEntrenamientoPy[] {
    return anticipadas.map((m) => ({
      lineaId: m.lineaId,
      lineaCodigo: m.lineaCodigo,
      fecha: m.fecha,
      turno: m.turno,
      modo: 'anticipado' as const,
      inicioTurno: m.inicioTurno,
      features: m.features,
      huboParadaImprevista: m.huboParadaImprevista,
      mermaSobreEstandar: m.mermaSobreEstandar,
      minutosImprevistos: m.minutosImprevistos,
      tipoCausaDominante: m.tipoCausaDominante,
    }));
  }

  private mensajePython(error: PythonEntrenamientoError): string {
    const cuerpo = error.cuerpo as { message?: string; detail?: unknown } | undefined;
    if (typeof cuerpo?.message === 'string') return cuerpo.message;
    if (cuerpo?.detail !== undefined) return JSON.stringify(cuerpo.detail);
    return error.message;
  }

  private async archivarFila(fila: ModeloVersion, motivo: string): Promise<void> {
    fila.estado = 'archivada';
    fila.error = motivo;
    await this.versiones.save(fila);
  }

  private async contarAlertas30d(): Promise<number> {
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    return this.alertas.count({ where: { generadaEn: MoreThanOrEqual(ahoraIso(desde)) } });
  }

  /**
   * Activación manual (`POST /analitica/modelo/:version/activar`, botón de la
   * pestaña Modelo): si la versión es `python-gbm`, primero hace el hot-swap
   * en Python y sólo si eso funciona archiva el resto en Postgres — al revés
   * dejaría la UI diciendo "vigente" una versión que `/predict` no sirve.
   */
  async activarManualmente(version: string): Promise<void> {
    const fila = await this.versiones.findOne({ where: { version, objetivo: OBJETIVO_PERSISTIDO } });
    if (fila?.proveedor === 'python-gbm') {
      await this.python.activar(OBJETIVO_PERSISTIDO, version);
    }
    await this.entrenamientoService.activar(version);
  }

  /* ---------------------------------------------------------------- */
  /* Huérfanas y reconciliación                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Archiva filas `entrenando` (en `modelo_version` y en
   * `entrenamiento_ejecucion`) más viejas que `HUERFANA_TIMEOUT_MS`: un
   * proceso caído a medio entrenar no debe dejar el sistema bloqueado
   * "esperando" para siempre.
   */
  async limpiarHuerfanas(): Promise<number> {
    const limite = ahoraIso(new Date(Date.now() - HUERFANA_TIMEOUT_MS));

    const entrenando = await this.versiones.find({ where: { estado: 'entrenando' } });
    const vencidas = entrenando.filter((f) => (f.iniciadoEn ?? f.entrenadoEn) < limite);
    for (const f of vencidas) {
      f.estado = 'archivada';
      f.error = f.error ?? 'Entrenamiento huérfano: sin actividad durante más de 2 h';
    }
    if (vencidas.length) await this.versiones.save(vencidas);

    const enCurso = await this.ejecuciones.find({ where: { estado: 'en_curso' } });
    const vencidasEj = enCurso.filter((e) => e.iniciadoEn < limite);
    for (const e of vencidasEj) {
      e.estado = 'error';
      e.error = e.error ?? 'Ejecución huérfana: sin actividad durante más de 2 h';
      e.finalizadoEn = ahoraIso();
    }
    if (vencidasEj.length) await this.ejecuciones.save(vencidasEj);

    const total = vencidas.length + vencidasEj.length;
    if (total) this.logger.warn(`Limpieza de huérfanas: ${vencidas.length} modelo_version + ${vencidasEj.length} entrenamiento_ejecucion`);
    return total;
  }

  /**
   * Si la versión vigente de `parada_imprevista` dice ser `python-gbm` pero
   * Python ya no tiene ese artefacto activo (reinicio, volumen perdido…), se
   * archiva: mostrar una versión "vigente" que en realidad cae a reglas
   * confundiría más que un estado claro de error.
   */
  async reconciliarConPython(): Promise<void> {
    const vigente = await this.versiones.findOne({ where: { estado: 'vigente', objetivo: OBJETIVO_PERSISTIDO } });
    if (!vigente || vigente.proveedor !== 'python-gbm') return;
    const actual = await this.python.modeloActual();
    if (actual === undefined) return; // Python inalcanzable: no penalizar por una caída transitoria
    if (actual === null || actual.version !== vigente.version) {
      vigente.estado = 'archivada';
      vigente.error = 'artefacto perdido';
      await this.versiones.save(vigente);
      this.logger.warn(`${vigente.version} vigente no tiene artefacto activo en Python; archivada (artefacto perdido)`);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Lock                                                               */
  /* ---------------------------------------------------------------- */

  /**
   * `pg_try_advisory_lock` en una conexión **dedicada** (no del pool): un
   * lock de sesión liberado por el pool de vuelta a otra conexión no
   * serializaría nada. En SQLite (dev/e2e) no hay advisory locks: se cae a
   * comprobar si ya existe una fila `entrenando`, que es lo que había antes
   * — con la misma carrera, pero sólo en el motor donde no hay entrenamientos
   * concurrentes reales que proteger.
   */
  private async adquirirLock(): Promise<boolean> {
    if (this.dataSource.options.type !== 'postgres') {
      const enCurso = await this.versiones.findOne({ where: { estado: 'entrenando' } });
      return !enCurso;
    }
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    const filas = (await runner.query('SELECT pg_try_advisory_lock($1) AS bloqueado', [
      LOCK_ENTRENAMIENTO_CONTINUO,
    ])) as { bloqueado: boolean }[];
    const bloqueado = Boolean(filas?.[0]?.bloqueado);
    if (!bloqueado) {
      await runner.release();
      return false;
    }
    this.lockRunner = runner;
    return true;
  }

  private async liberarLock(): Promise<void> {
    const runner = this.lockRunner;
    this.lockRunner = undefined;
    if (!runner) return;
    try {
      await runner.query('SELECT pg_advisory_unlock($1)', [LOCK_ENTRENAMIENTO_CONTINUO]);
    } catch (error: unknown) {
      this.logger.warn(`No se pudo liberar el advisory lock: ${(error as Error).message}`);
    } finally {
      await runner.release();
    }
  }
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Number.isFinite(valor) ? Math.round(valor * factor) / factor : 0;
}
