import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { calcEp } from '@mes/shared';
import type {
  AnaliticaResumen,
  EstadoDatos,
  EstadoFase,
  FaseCrispDm,
  Modelo,
  Patrones,
  PrediccionActiva,
  Predicciones,
  ReentrenamientoJob,
  VariableEntrada,
  VersionModelo,
} from '@mes/types';
import { TIPO_ALERTA_LABEL } from '@mes/types';
import { ConflictoException, NoEncontradoException } from '../../common/exceptions';
import { ahoraIso, hoyIso, redondear } from '../../common/utils';
import {
  Alerta,
  IndicadorDiario,
  Merma,
  ModeloVersion,
  MuestraAnalitica,
  OrdenFabricacion,
  Parada,
  Prediccion,
  RegistroEp,
  type DecisionPromocion,
  type DisparadorEntrenamiento,
} from '../../database/entities';
import {
  EVENTOS_DEMO_INSUFICIENTES,
  EVENTOS_REQUERIDOS,
  EXCEDENTE_DEMO,
  FASES_DESCRIPCION,
  RITMO_DIARIO_EVENTOS,
} from './analytics.constants';
import {
  DatosInsuficientesError,
  EntrenamientoContinuoService,
  EntrenamientoService,
  OBJETIVO_PERSISTIDO,
} from './modelado';
import { RiesgoService } from './inferencia';
import { PatronesService } from './patrones';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaFecha(isoFecha: string): string {
  const d = new Date(`${isoFecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** Filas del histórico de predicciones que se envían a la pestaña Predicciones. */
const MAX_HISTORICO = 40;

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);

  /**
   * Último reentrenamiento lanzado desde el botón. El contrato
   * `ReentrenamientoJob` lo sondea la UI cada 2 s hasta que la versión queda
   * vigente; al vivir en memoria se reinicia con el proceso, que es justo lo
   * que se quiere (un job huérfano no debe sobrevivir a un despliegue).
   */
  private job: ReentrenamientoJob | null = null;

  /** Reentrenamiento en vuelo, para poder esperarlo al apagar la aplicación. */
  private enVuelo: Promise<void> | null = null;

  constructor(
    @InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>,
    @InjectRepository(Prediccion) private readonly predicciones: Repository<Prediccion>,
    @InjectRepository(IndicadorDiario) private readonly diarios: Repository<IndicadorDiario>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
    @InjectRepository(RegistroEp) private readonly registrosEp: Repository<RegistroEp>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(MuestraAnalitica) private readonly muestras: Repository<MuestraAnalitica>,
    private readonly patronesService: PatronesService,
    private readonly riesgo: RiesgoService,
    private readonly entrenamiento: EntrenamientoService,
    private readonly entrenamientoContinuo: EntrenamientoContinuoService,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 08.A — Resumen                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * `vigente` puede ser `null`: sin `services/prediccion-py` disponible (o sin
   * corpus suficiente) el arranque no siembra ningún `modelo_version` (§F5).
   * Ese estado ya lo distingue el frontend por su cuenta vía
   * `/analitica/estado-datos` (08.E, `DatosInsuficientes.tsx`) — pero el
   * backend no debe 404 las 4 pestañas sólo porque todavía no hay modelo: el
   * resto de la pantalla (riesgo por línea vía cascada, insights, alertas
   * activas) sigue funcionando sin él.
   */
  async resumen(): Promise<AnaliticaResumen> {
    const vigente = await this.vigenteOpcional();
    const anterior = vigente ? await this.anterior(vigente.version) : null;
    const activas = await this.alertas.find({ where: { estado: 'activa' }, order: { generadaEn: 'DESC' } });

    const prediccionesActivas: PrediccionActiva[] = activas.map((a) => ({
      id: a.id,
      lineaCodigo: a.lineaCodigo,
      tipo: TIPO_ALERTA_LABEL[a.tipo],
      prediccion: a.prediccion,
      probabilidad: a.probabilidad,
      ventana: `${a.ventanaInicio.slice(11, 16)}–${a.ventanaFin.slice(11, 16)}`,
      estado: 'Activa',
    }));

    const alertas30d = await this.contarAlertas30d();
    const [insights, riesgoPorLinea] = await Promise.all([
      this.patronesService.insights(),
      this.riesgo.riesgoPorLinea(),
    ]);

    return {
      modelo: vigente
        ? {
            version: vigente.version,
            entrenadoEn: vigente.entrenadoEn,
            eventos: vigente.eventos,
            algoritmo: vigente.algoritmo,
            activo: vigente.estado === 'vigente',
          }
        : {
            version: 'sin-entrenar',
            entrenadoEn: '',
            eventos: 0,
            algoritmo: 'Sin modelo entrenado',
            activo: false,
          },
      variablesModelo: vigente?.features ?? 0,
      kpis: {
        ep: await this.epActual(),
        precision: vigente?.precision ?? 0,
        recall: vigente?.recall ?? 0,
        alertas30d,
        precisionDelta: anterior && vigente ? redondear(vigente.precision - anterior.precision) : undefined,
        recallDelta: anterior && vigente ? redondear(vigente.recall - anterior.recall) : undefined,
        alertas30dDelta: anterior ? alertas30d - anterior.alertas30d : undefined,
      },
      insights,
      riesgoPorLinea,
      prediccionesActivas,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 08.B — Patrones                                                   */
  /* ---------------------------------------------------------------- */

  async patrones(): Promise<Patrones> {
    const [heatmap, recurrencias, eventosAnalizados] = await Promise.all([
      this.patronesService.heatmap(),
      this.patronesService.recurrencias(),
      this.patronesService.eventosAnalizados(),
    ]);
    return { heatmap, recurrencias, eventosAnalizados };
  }

  /* ---------------------------------------------------------------- */
  /* 08.C — Predicciones                                               */
  /* ---------------------------------------------------------------- */

  async prediccionesSerie(): Promise<Predicciones> {
    const dias = await this.diarios.find({ order: { fecha: 'ASC' } });
    const serie = dias.map((d) => ({
      fecha: d.fecha,
      etiqueta: etiquetaFecha(d.fecha),
      predicho: d.prediccionesPredichas,
      real: d.prediccionesReales,
    }));
    const filas = await this.predicciones.find({
      order: { fecha: 'DESC', id: 'ASC' },
      take: MAX_HISTORICO,
    });
    const vigente = await this.versiones.findOne({ where: { estado: 'vigente' } });
    return {
      serie,
      historico: filas.map((p) => ({
        id: p.id,
        fecha: p.fecha,
        lineaCodigo: p.lineaCodigo,
        tipo: p.tipo,
        prediccion: p.prediccion,
        probabilidad: p.probabilidad,
        eventoReal: p.eventoReal,
        acierto: p.acierto,
      })),
      matrizConfusion: vigente
        ? { vp: vigente.vp, fp: vigente.fp, vn: vigente.vn, fn: vigente.fn }
        : undefined,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 08.D — Modelo CRISP-DM                                            */
  /* ---------------------------------------------------------------- */

  async modelo(): Promise<Modelo> {
    const filas = await this.versiones.find({ where: { objetivo: OBJETIVO_PERSISTIDO }, order: { orden: 'ASC' } });
    const vigente = filas.find((v) => v.estado === 'vigente') ?? filas[0];
    const entrenando = filas.some((v) => v.estado === 'entrenando');

    /*
     * Sin ninguna fila de `modelo_version` (arranque sin `services/prediccion-py`
     * disponible, o sin corpus suficiente, §F5): la pestaña Modelo es la ÚNICA
     * que el frontend sigue consultando aunque `estado-datos` diga «insuficiente»
     * (muestra la metodología CRISP-DM como documentación), así que no puede
     * 404 — responde con las 6 fases pendientes y sin versiones.
     */
    if (!vigente) {
      const fasesCrispDm: FaseCrispDm[] = FASES_DESCRIPCION.map((fase, i) => ({
        id: fase.id,
        orden: i + 1,
        nombre: fase.nombre,
        estado: fase.id === 'comprension_negocio' ? 'completada' : 'pendiente',
        descripcion: fase.descripcion,
        metricas: fase.metricas ?? [],
      }));
      return {
        fasesCrispDm,
        metricas: { registros: 0, features: 0, algoritmo: 'Sin modelo entrenado', auc: 0, f1: 0, vp: 0, fp: 0, vn: 0, fn: 0 },
        versiones: [],
        variablesEntrada: [],
        reentrenamiento: this.job ?? undefined,
      };
    }

    const perfil = vigente.perfilDatos;
    const muestras = await this.muestras.count({ where: { modo: 'anticipado' } });
    const vivas = await this.predicciones.count({ where: { origen: 'vivo' } });

    /* Cada fase reporta lo que de verdad quedó persistido: si no hay perfil, la
     * fase 2 no está «completada» por mucho que el texto exista. */
    const hechos: Record<string, { estado: EstadoFase; metricas: { label: string; valor: string }[] }> = {
      comprension_negocio: {
        estado: 'completada',
        metricas: [
          { label: 'Objetivos', valor: '3' },
          { label: 'RF cubiertos', valor: 'RF8, RF9' },
        ],
      },
      comprension_datos: {
        estado: perfil ? 'completada' : 'pendiente',
        metricas: perfil
          ? [
              { label: 'Registros', valor: this.miles(perfil.ordenes + perfil.paradas + perfil.mermas) },
              { label: 'Sin categorizar', valor: `${this.decimal(perfil.pctParadasSinCategorizar)} %` },
            ]
          : [],
      },
      preparacion: {
        estado: muestras > 0 ? 'completada' : 'pendiente',
        metricas: [
          { label: 'Muestras', valor: this.miles(muestras) },
          { label: 'Features', valor: String(vigente.features) },
        ],
      },
      modelado: {
        /* `coeficientes` es del motor TS heredado; el motor real (bloque B)
         * es Python, que no guarda pesos en Postgres — sólo el artefacto y su
         * hash. Sin este `||` la fase se quedaría «pendiente» para siempre en
         * cuanto la primera versión `python-gbm` quedara vigente. */
        estado:
          vigente.coeficientes || (vigente.proveedor === 'python-gbm' && vigente.artefactoUri)
            ? 'completada'
            : entrenando
              ? 'en_curso'
              : 'pendiente',
        metricas: [
          { label: 'Algoritmo', valor: vigente.algoritmo.replace(/\s*\(.*\)$/, '') },
          { label: 'Positivos', valor: perfil ? `${this.decimal(perfil.tasaPositivos * 100)} %` : '—' },
        ],
      },
      evaluacion: {
        estado: vigente.vp + vigente.fp + vigente.vn + vigente.fn > 0 ? 'completada' : 'pendiente',
        metricas: [
          { label: 'AUC', valor: this.decimal(vigente.auc, 2) },
          { label: 'Brier', valor: this.decimal(vigente.brier, 3) },
        ],
      },
      despliegue: {
        estado: entrenando ? 'en_curso' : vivas > 0 ? 'completada' : 'en_curso',
        metricas: [
          { label: 'Versión activa', valor: vigente.version },
          { label: 'Alertas 30 d', valor: String(await this.contarAlertas30d()) },
        ],
      },
    };

    const fasesCrispDm: FaseCrispDm[] = FASES_DESCRIPCION.map((fase, i) => ({
      id: fase.id,
      orden: i + 1,
      nombre: fase.nombre,
      estado: hechos[fase.id]?.estado ?? 'pendiente',
      descripcion: fase.descripcion,
      metricas: fase.metricas ?? hechos[fase.id]?.metricas ?? [],
    }));

    const versiones: VersionModelo[] = filas.map((v) => ({
      version: v.version,
      entrenadoEn: v.entrenadoEn,
      eventos: v.eventos,
      auc: v.auc,
      f1: v.f1,
      estado: v.estado === 'entrenando' ? 'archivada' : v.estado,
    }));

    const variablesEntrada: VariableEntrada[] = vigente.importancias ?? [];

    return {
      fasesCrispDm,
      metricas: {
        registros: vigente.eventos,
        features: vigente.features,
        algoritmo: vigente.algoritmo,
        auc: vigente.auc,
        f1: vigente.f1,
        vp: vigente.vp,
        fp: vigente.fp,
        vn: vigente.vn,
        fn: vigente.fn,
        corteEntrenamiento: vigente.corteEntrenamiento ?? undefined,
        corteValidacion: vigente.cortePrueba ?? undefined,
      },
      versiones,
      variablesEntrada,
      reentrenamiento: this.job ?? undefined,
    };
  }

  /** Diagnóstico ampliado para la tesis: matriz, umbral y perfil del corpus. */
  async diagnostico(): Promise<Record<string, unknown>> {
    const vigente = await this.vigente();
    return {
      version: vigente.version,
      objetivo: vigente.objetivo,
      proveedor: vigente.proveedor,
      algoritmo: vigente.algoritmo,
      muestras: vigente.eventos,
      features: vigente.features,
      validacion: 'walk-forward de 5 pliegues expansivos (temporal, no aleatoria)',
      matrizConfusion: { vp: vigente.vp, fp: vigente.fp, vn: vigente.vn, fn: vigente.fn },
      auc: vigente.auc,
      aucCorteUnico: vigente.aucPrueba,
      aucModoRetro: vigente.aucRetro,
      f1: vigente.f1,
      precision: vigente.precision,
      recall: vigente.recall,
      brier: vigente.brier,
      liftTop3: vigente.liftTop3,
      umbralDecision: vigente.umbralDecision,
      corteEntrenamiento: vigente.corteEntrenamiento,
      cortePrueba: vigente.cortePrueba,
      /*
       * Python es el único motor de modelado (F5): ya no hay coeficientes de
       * regresión logística que reponderar en Nest. `topFeatures` sale de
       * `importancias`, que Python ya devuelve agrupadas y ordenadas en la
       * propia respuesta de `POST /entrenar` (§3 del contrato).
       */
      topFeatures: (vigente.importancias ?? [])
        .slice()
        .sort((a, b) => b.importancia - a.importancia)
        .slice(0, 8)
        .map((v) => ({ nombre: v.nombre, importancia: v.importancia })),
      perfilDatos: vigente.perfilDatos,
    };
  }

  /** CSV del feature store para el capítulo de la tesis y para entrenar fuera. */
  async exportarDataset(): Promise<string> {
    const filas = await this.muestras.find({ order: { inicioTurno: 'ASC', lineaCodigo: 'ASC' } });
    if (!filas.length) return 'sin_muestras\n';
    const nombres = [...new Set(filas.flatMap((f) => Object.keys(f.features)))].sort();
    const cabecera = [
      'lineaCodigo',
      'fecha',
      'turno',
      'modo',
      'huboParadaImprevista',
      'mermaSobreEstandar',
      'minutosImprevistos',
      ...nombres,
    ];
    const lineas = filas.map((f) =>
      [
        f.lineaCodigo,
        f.fecha,
        f.turno,
        f.modo,
        f.huboParadaImprevista,
        f.mermaSobreEstandar,
        f.minutosImprevistos,
        ...nombres.map((n) => f.features[n] ?? ''),
      ].join(','),
    );
    return [cabecera.join(','), ...lineas].join('\n');
  }

  /** Fuerza un ciclo de inferencia sin esperar al cron (QA y demo). */
  async recalcular(): Promise<{ predicciones: number; alertas: number; vencidas: number; proveedor: string }> {
    const ciclo = await this.riesgo.ejecutarCiclo();
    return {
      predicciones: ciclo.predicciones,
      alertas: ciclo.alertas,
      vencidas: ciclo.vencidas,
      proveedor: ciclo.proveedor,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 08.E — Estado de los datos                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Avance del volumen mínimo de eventos (08.E). Cuenta eventos productivos
   * reales —órdenes, paradas y mermas—, no una constante migrada. `estado`
   * conserva el interruptor de demo/QA que usan los mocks msw.
   */
  async estadoDatos(estado?: 'suficiente' | 'insuficiente'): Promise<EstadoDatos> {
    const calculados = await this.contarEventos();
    const eventos =
      estado === 'suficiente' && calculados < EVENTOS_REQUERIDOS
        ? EVENTOS_REQUERIDOS + EXCEDENTE_DEMO
        : estado === 'insuficiente' && calculados >= EVENTOS_REQUERIDOS
          ? EVENTOS_DEMO_INSUFICIENTES
          : calculados;
    const faltan = Math.max(0, EVENTOS_REQUERIDOS - eventos);
    const ritmo = await this.ritmoDiario();
    const dias = Math.ceil(faltan / ritmo);
    return {
      suficiente: eventos >= EVENTOS_REQUERIDOS,
      eventos,
      requeridos: EVENTOS_REQUERIDOS,
      progresoPct: redondear((eventos / EVENTOS_REQUERIDOS) * 100),
      estimacion:
        faltan === 0
          ? 'Volumen suficiente · el modelo se reentrena cada mes'
          : `≈ ${dias} días al ritmo actual de registro`,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Reentrenamiento y activación                                      */
  /* ---------------------------------------------------------------- */

  /**
   * Encola un reentrenamiento contra el orquestador continuo
   * (`EntrenamientoContinuoService`) y responde 202 de inmediato: el
   * entrenamiento en sí corre contra `services/prediccion-py` (hasta 600 s),
   * así que la respuesta no puede esperarlo. El contrato con la UI sigue
   * siendo `ReentrenamientoJob`: el sondeo de `useModelo()` no cambia, aunque
   * ahora el `mensaje` puede terminar diciendo que la versión candidata **no**
   * quedó vigente (`v2.4 archivada: no mejora a v2.1…`).
   *
   * Python es el único motor desde este bloque: tanto `/analitica/reentrenar`
   * como `/analitica/reentrenar/continuo` llaman a este mismo método — el
   * segundo existe porque el plan lo pide explícito, no porque haga algo
   * distinto.
   */
  async reentrenar(disparador: DisparadorEntrenamiento = 'manual'): Promise<ReentrenamientoJob> {
    const enCurso = await this.versiones.findOne({ where: { estado: 'entrenando' } });
    if (enCurso) throw new ConflictoException('Ya hay un reentrenamiento en curso');

    /* Sólo para etiquetar el job de inmediato: la versión real la fija el
     * orquestador bajo el lock, un instante después. Si algo se cuela entre
     * medio (muy improbable, el lock lo impide para la corrida real) el
     * peor caso es una etiqueta de versión que no coincide exactamente con
     * la persistida — cosmético, no afecta qué queda vigente. */
    const version = await this.entrenamiento.siguienteVersion();
    const job: ReentrenamientoJob = {
      id: `RET-${version.replace(/\./g, '')}`,
      estado: 'entrenando',
      version,
      iniciadoEn: ahoraIso(),
      mensaje: 'Reconstruyendo el feature store y entrenando contra el servicio de predicción',
    };
    this.job = job;

    /* No se espera aquí: la respuesta 202 sale de inmediato y el pipeline
     * sigue en segundo plano (lo recoge `onModuleDestroy` al apagar). */
    this.enVuelo = this.ejecutarReentrenamientoContinuo(disparador, job);
    return job;
  }

  /**
   * `POST /analitica/reentrenar/continuo`: mismo motor y mismo contrato que
   * `reentrenar()` — existe como ruta explícita porque el plan la pide así,
   * no porque dispare un pipeline distinto (Python es el único motor).
   */
  async reentrenarContinuo(): Promise<ReentrenamientoJob> {
    return this.reentrenar('manual');
  }

  /**
   * Cerrar la app mientras un reentrenamiento sigue en vuelo dejaría al
   * pipeline escribiendo sobre una conexión ya cerrada (y reventando el proceso
   * en los e2e): se espera a que termine.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.enVuelo) await this.enVuelo.catch(() => undefined);
  }

  /** Corre fuera del ciclo de petición: la respuesta ya salió con 202. */
  private async ejecutarReentrenamientoContinuo(
    disparador: DisparadorEntrenamiento,
    jobInicial: ReentrenamientoJob,
  ): Promise<void> {
    try {
      const ejecucion = await this.entrenamientoContinuo.ejecutar(disparador);
      const promovida: DecisionPromocion[] = ['promovido', 'sin_incumbente'];
      const cabecera =
        ejecucion.estado === 'completado'
          ? `${ejecucion.version} ${ejecucion.decision && promovida.includes(ejecucion.decision) ? 'vigente' : 'archivada'}`
          : ejecucion.estado === 'omitido'
            ? `${ejecucion.version} omitido`
            : `${ejecucion.version} con error`;
      const detalle = ejecucion.motivo ?? ejecucion.error ?? 'sin más detalle';
      this.job = {
        id: jobInicial.id,
        estado: ejecucion.estado === 'completado' ? 'listo' : 'error',
        version: ejecucion.version,
        iniciadoEn: jobInicial.iniciadoEn,
        mensaje: `${cabecera}: ${detalle}`,
      };
      if (ejecucion.estado === 'error') this.logger.error(this.job.mensaje);
      else this.logger.log(this.job.mensaje);
    } catch (error: unknown) {
      const mensaje =
        error instanceof DatosInsuficientesError ? error.message : `Fallo al reentrenar: ${(error as Error).message}`;
      this.job = { ...jobInicial, estado: 'error', mensaje };
      this.logger.error(mensaje);
    }
  }

  async activar(version: string): Promise<Modelo> {
    const objetivo = await this.versiones.findOne({ where: { version, objetivo: OBJETIVO_PERSISTIDO } });
    if (!objetivo) throw new NoEncontradoException('Versión del modelo');
    if (objetivo.estado === 'entrenando') {
      throw new ConflictoException('La versión aún se está entrenando');
    }
    await this.entrenamientoContinuo.activarManualmente(version);
    return this.modelo();
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  private async vigente(): Promise<ModeloVersion> {
    const encontrada = await this.vigenteOpcional();
    if (!encontrada) throw new NoEncontradoException('Modelo predictivo');
    return encontrada;
  }

  /** `null`, no 404: usarlo donde «todavía no hay modelo» es un estado válido, no un error. */
  private async vigenteOpcional(): Promise<ModeloVersion | null> {
    const vigente = await this.versiones.findOne({ where: { estado: 'vigente', objetivo: OBJETIVO_PERSISTIDO } });
    if (vigente) return vigente;
    return this.versiones.findOne({
      where: { objetivo: OBJETIVO_PERSISTIDO },
      order: { orden: 'ASC' },
    });
  }

  /** Versión archivada más reciente, para los deltas de los KPI del Resumen. */
  private async anterior(version: string): Promise<ModeloVersion | null> {
    const filas = await this.versiones.find({
      where: { estado: 'archivada', objetivo: OBJETIVO_PERSISTIDO },
      order: { orden: 'ASC' },
    });
    return filas.find((f) => f.version !== version && (f.coeficientes !== null || f.proveedor === 'python-gbm')) ?? null;
  }

  private async epActual(): Promise<number> {
    const totales = await this.registrosEp.count();
    const correctas = await this.registrosEp.countBy({ acierto: true });
    return calcEp(correctas, totales);
  }

  private async contarAlertas30d(): Promise<number> {
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    return this.alertas.count({ where: { generadaEn: MoreThanOrEqual(ahoraIso(desde)) } });
  }

  /** Eventos productivos registrados: órdenes + paradas + mermas. */
  private async contarEventos(): Promise<number> {
    const [ordenes, paradas, mermas] = await Promise.all([
      this.ordenes.count(),
      this.paradas.count(),
      this.mermas.count(),
    ]);
    return ordenes + paradas + mermas;
  }

  /**
   * Media diaria de eventos de la última semana **con datos** (no de los
   * últimos 7 días del reloj): con un corpus sincronizado que termina hace unos
   * días, medir contra el reloj daría un ritmo de cero y una estimación infinita.
   */
  private async ritmoDiario(): Promise<number> {
    const ultima = await this.ordenes.findOne({ where: {}, order: { fecha: 'DESC' } });
    if (!ultima) return RITMO_DIARIO_EVENTOS;
    const desde = new Date(`${ultima.fecha}T00:00:00`);
    desde.setDate(desde.getDate() - 6);
    const corte = hoyIso(desde);
    const [ordenes, paradas, mermas] = await Promise.all([
      this.ordenes.count({ where: { fecha: MoreThanOrEqual(corte) } }),
      this.paradas.count({ where: { inicio: MoreThanOrEqual(corte) } }),
      this.mermas.count({ where: { registradaEn: MoreThanOrEqual(corte) } }),
    ]);
    const ritmo = Math.round((ordenes + paradas + mermas) / 7);
    return ritmo > 0 ? ritmo : RITMO_DIARIO_EVENTOS;
  }

  private miles(valor: number): string {
    return valor.toLocaleString('es-PE').replace(/,/g, ' ');
  }

  private decimal(valor: number, decimales = 1): string {
    return valor.toFixed(decimales).replace('.', ',');
  }
}
