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
} from '../../database/entities';
import { ModeloLocalPredictionProvider } from '../alerts/prediction';
import {
  EVENTOS_DEMO_INSUFICIENTES,
  EVENTOS_REQUERIDOS,
  EXCEDENTE_DEMO,
  FASES_DESCRIPCION,
  RITMO_DIARIO_EVENTOS,
} from './analytics.constants';
import { DatosInsuficientesError, EntrenamientoService, importanciaRelativa } from './modelado';
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
    private readonly modeloLocal: ModeloLocalPredictionProvider,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 08.A — Resumen                                                    */
  /* ---------------------------------------------------------------- */

  async resumen(): Promise<AnaliticaResumen> {
    const vigente = await this.vigente();
    const anterior = await this.anterior(vigente.version);
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
      modelo: {
        version: vigente.version,
        entrenadoEn: vigente.entrenadoEn,
        eventos: vigente.eventos,
        algoritmo: vigente.algoritmo,
        activo: vigente.estado === 'vigente',
      },
      variablesModelo: vigente.features,
      kpis: {
        ep: await this.epActual(),
        precision: vigente.precision,
        recall: vigente.recall,
        alertas30d,
        precisionDelta: anterior ? redondear(vigente.precision - anterior.precision) : undefined,
        recallDelta: anterior ? redondear(vigente.recall - anterior.recall) : undefined,
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
    const filas = await this.versiones.find({ order: { orden: 'ASC' } });
    const vigente = filas.find((v) => v.estado === 'vigente') ?? filas[0];
    if (!vigente) throw new NoEncontradoException('Modelo predictivo');
    const entrenando = filas.some((v) => v.estado === 'entrenando');
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
        estado: vigente.coeficientes ? 'completada' : entrenando ? 'en_curso' : 'pendiente',
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
      lambdaL2: vigente.coeficientes?.lambdaL2 ?? null,
      /* Coeficientes más influyentes por nombre crudo de feature: es lo que
       * permite comprobar que el pipeline descubrió un patrón concreto. */
      topFeatures: vigente.coeficientes
        ? importanciaRelativa({
            ...vigente.coeficientes,
            nombres: vigente.coeficientes.nombres,
          }).slice(0, 8)
        : [],
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
   * Lanza el pipeline completo y responde 202 de inmediato: reconstruir el
   * feature store, validar, entrenar y rehacer el backtest tarda menos de dos
   * segundos con este volumen, pero el contrato con la UI es asíncrono y el
   * sondeo de `useModelo()` no cambia.
   */
  async reentrenar(): Promise<ReentrenamientoJob> {
    const enCurso = await this.versiones.findOne({ where: { estado: 'entrenando' } });
    if (enCurso) throw new ConflictoException('Ya hay un reentrenamiento en curso');

    const version = await this.entrenamiento.siguienteVersion();
    const eventos = await this.muestras.count({ where: { modo: 'anticipado' } });
    await this.versiones.save(
      this.versiones.create({
        version,
        entrenadoEn: hoyIso(),
        eventos,
        estado: 'entrenando',
        algoritmo: 'Regresión logística L2 (TypeScript)',
        orden: -1,
      }),
    );

    this.job = {
      id: `RET-${version.replace(/\./g, '')}`,
      estado: 'entrenando',
      version,
      iniciadoEn: ahoraIso(),
      mensaje: 'Reconstruyendo el feature store y reentrenando el modelo',
    };

    /* No se espera aquí: la respuesta 202 sale de inmediato y el pipeline
     * sigue en segundo plano (lo recoge `onModuleDestroy` al apagar). */
    this.enVuelo = this.ejecutarReentrenamiento(version);
    return this.job;
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
  private async ejecutarReentrenamiento(version: string): Promise<void> {
    try {
      const resultado = await this.entrenamiento.entrenar(version);
      this.modeloLocal.invalidar();
      this.job = {
        id: `RET-${version.replace(/\./g, '')}`,
        estado: 'listo',
        version,
        iniciadoEn: this.job?.iniciadoEn ?? ahoraIso(),
        mensaje:
          `${version} vigente · ${this.miles(resultado.muestras)} muestras · ` +
          `AUC ${this.decimal(resultado.auc, 2)} · F1 ${this.decimal(resultado.f1, 2)}`,
      };
      this.logger.log(this.job.mensaje);
    } catch (error: unknown) {
      const mensaje =
        error instanceof DatosInsuficientesError
          ? error.message
          : `Fallo al reentrenar: ${(error as Error).message}`;
      await this.versiones
        .update({ version }, { estado: 'archivada', error: mensaje })
        .catch(() => undefined);
      this.job = {
        id: `RET-${version.replace(/\./g, '')}`,
        estado: 'error',
        version,
        iniciadoEn: this.job?.iniciadoEn ?? ahoraIso(),
        mensaje,
      };
      this.logger.error(mensaje);
    }
  }

  async activar(version: string): Promise<Modelo> {
    const objetivo = await this.versiones.findOne({ where: { version } });
    if (!objetivo) throw new NoEncontradoException('Versión del modelo');
    if (objetivo.estado === 'entrenando') {
      throw new ConflictoException('La versión aún se está entrenando');
    }
    await this.entrenamiento.activar(version);
    this.modeloLocal.invalidar();
    return this.modelo();
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  private async vigente(): Promise<ModeloVersion> {
    const vigente = await this.versiones.findOne({ where: { estado: 'vigente' } });
    if (vigente) return vigente;
    const cualquiera = await this.versiones.findOne({ where: {}, order: { orden: 'ASC' } });
    if (!cualquiera) throw new NoEncontradoException('Modelo predictivo');
    return cualquiera;
  }

  /** Versión archivada más reciente, para los deltas de los KPI del Resumen. */
  private async anterior(version: string): Promise<ModeloVersion | null> {
    const filas = await this.versiones.find({ where: { estado: 'archivada' }, order: { orden: 'ASC' } });
    return filas.find((f) => f.version !== version && f.coeficientes !== null) ?? null;
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
