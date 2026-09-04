import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { calcEp } from '@mes/shared';
import type {
  AnaliticaResumen,
  EstadoDatos,
  FaseCrispDm,
  HeatmapCelda,
  Modelo,
  Patrones,
  PrediccionActiva,
  Predicciones,
  ReentrenamientoJob,
  RiesgoLinea,
  Turno,
  VersionModelo,
} from '@mes/types';
import { TIPO_ALERTA_LABEL, TURNO_LABEL, TURNOS } from '@mes/types';
import { ConflictoException, NoEncontradoException } from '../../common/exceptions';
import { ahoraIso, hoyIso, redondear } from '../../common/utils';
import {
  Alerta,
  IndicadorDiario,
  ModeloVersion,
  ParadaAgregada,
  Prediccion,
  RegistroEp,
  RegistroTiempo,
} from '../../database/entities';
import {
  EVENTOS_DEMO_INSUFICIENTES,
  EVENTOS_MIGRADOS,
  EXCEDENTE_DEMO,
  EVENTOS_REQUERIDOS,
  FASES_DESCRIPCION,
  INSIGHTS,
  RECURRENCIAS,
  RIESGO_POR_LINEA,
  RITMO_DIARIO_EVENTOS,
  VARIABLES_ENTRADA,
} from './analytics.constants';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaFecha(isoFecha: string): string {
  const d = new Date(`${isoFecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/** Segundos que tarda un reentrenamiento simulado en pasar a `vigente`. */
const DURACION_REENTRENAMIENTO_MS = 3000;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>,
    @InjectRepository(Prediccion) private readonly predicciones: Repository<Prediccion>,
    @InjectRepository(IndicadorDiario) private readonly diarios: Repository<IndicadorDiario>,
    @InjectRepository(ParadaAgregada) private readonly paradas: Repository<ParadaAgregada>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
    @InjectRepository(RegistroEp) private readonly registrosEp: Repository<RegistroEp>,
    @InjectRepository(RegistroTiempo) private readonly tiempos: Repository<RegistroTiempo>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* 08.A — Resumen                                                    */
  /* ---------------------------------------------------------------- */

  async resumen(): Promise<AnaliticaResumen> {
    const vigente = await this.vigente();
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

    return {
      modelo: {
        version: vigente.version,
        entrenadoEn: vigente.entrenadoEn,
        eventos: vigente.eventos,
        algoritmo: vigente.algoritmo,
        activo: true,
      },
      kpis: {
        ep: await this.epActual(),
        precision: vigente.precision,
        recall: vigente.recall,
        alertas30d: vigente.alertas30d,
      },
      insights: INSIGHTS,
      riesgoPorLinea: this.riesgoPorLinea(),
      prediccionesActivas,
    };
  }

  /** Turno objetivo del riesgo: el siguiente al que corre ahora. */
  private riesgoPorLinea(): RiesgoLinea[] {
    const hora = new Date().getHours();
    // Turnos reales: Día 06:00–18:00 y Noche 18:00–06:00.
    const siguiente: Turno = hora >= 6 && hora < 18 ? 'N' : 'D';
    return RIESGO_POR_LINEA.map((r) => ({ ...r, turnoObjetivo: siguiente }));
  }

  /* ---------------------------------------------------------------- */
  /* 08.B — Patrones                                                   */
  /* ---------------------------------------------------------------- */

  async patrones(): Promise<Patrones> {
    const causas = await this.paradas.find({ order: { orden: 'ASC' } });
    const heatmap: HeatmapCelda[] = causas.flatMap((c) =>
      TURNOS.map((turno, i) => ({
        fila: c.causaCodigo,
        filaLabel: `${c.causaCodigo} ${c.causaNombre}`,
        columna: turno,
        columnaLabel: TURNO_LABEL[turno],
        valor: c.minutosPorTurno[i] ?? 0,
      })),
    );
    return { heatmap, recurrencias: RECURRENCIAS };
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
    const filas = await this.predicciones.find({ order: { fecha: 'DESC', id: 'ASC' } });
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
    };
  }

  /* ---------------------------------------------------------------- */
  /* 08.D — Modelo CRISP-DM                                            */
  /* ---------------------------------------------------------------- */

  async modelo(): Promise<Modelo> {
    const filas = await this.versiones.find({ order: { orden: 'ASC' } });
    const vigente = filas.find((v) => v.estado === 'vigente') ?? filas[0]!;
    const entrenando = filas.some((v) => v.estado === 'entrenando');

    const metricasPorFase: Record<string, { label: string; valor: string }[]> = {
      comprension_datos: [
        { label: 'Registros', valor: this.miles(vigente.eventos) },
        { label: 'Fuentes', valor: '4' },
      ],
      preparacion: [
        { label: 'Features', valor: String(vigente.features) },
        { label: 'Nulos tratados', valor: '2,1 %' },
      ],
      modelado: [
        { label: 'Algoritmo', valor: vigente.algoritmo.replace(/\s*\(.*\)$/, '') },
        { label: 'Pliegues', valor: '5' },
      ],
      evaluacion: [
        { label: 'AUC', valor: this.decimal(vigente.auc) },
        { label: 'F1', valor: this.decimal(vigente.f1) },
      ],
      despliegue: [
        { label: 'Versión activa', valor: vigente.version },
        { label: 'Alertas 30 d', valor: String(vigente.alertas30d) },
      ],
    };

    const fasesCrispDm: FaseCrispDm[] = FASES_DESCRIPCION.map((fase, i) => ({
      id: fase.id,
      orden: i + 1,
      nombre: fase.nombre,
      estado: fase.id === 'despliegue' ? (entrenando ? 'en_curso' : 'en_curso') : 'completada',
      descripcion: fase.descripcion,
      metricas: fase.metricas ?? metricasPorFase[fase.id] ?? [],
    }));

    const versiones: VersionModelo[] = filas.map((v) => ({
      version: v.version,
      entrenadoEn: v.entrenadoEn,
      eventos: v.eventos,
      auc: v.auc,
      f1: v.f1,
      estado: v.estado === 'entrenando' ? 'archivada' : v.estado,
    }));

    return {
      fasesCrispDm,
      metricas: {
        registros: vigente.eventos,
        features: vigente.features,
        algoritmo: vigente.algoritmo,
        auc: vigente.auc,
        f1: vigente.f1,
      },
      versiones,
      variablesEntrada: VARIABLES_ENTRADA,
    };
  }

  /* ---------------------------------------------------------------- */
  /* 08.E — Estado de los datos                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Avance del volumen mínimo de eventos (08.E). `estado` fuerza la variante que
   * se quiere ver — el mismo interruptor de demo que ofrecen los mocks msw — sin
   * tocar el cálculo real cuando no se envía.
   */
  async estadoDatos(estado?: 'suficiente' | 'insuficiente'): Promise<EstadoDatos> {
    /* Eventos migrados + cada registro cronometrado del postest (Anexo 02). */
    const registrados = await this.tiempos.countBy({ etapa: 'postest' });
    const calculados = EVENTOS_MIGRADOS + registrados;
    const eventos =
      estado === 'suficiente' && calculados < EVENTOS_REQUERIDOS
        ? EVENTOS_REQUERIDOS + EXCEDENTE_DEMO
        : estado === 'insuficiente' && calculados >= EVENTOS_REQUERIDOS
          ? EVENTOS_DEMO_INSUFICIENTES
          : calculados;
    const faltan = Math.max(0, EVENTOS_REQUERIDOS - eventos);
    const dias = Math.ceil(faltan / RITMO_DIARIO_EVENTOS);
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

  async reentrenar(): Promise<ReentrenamientoJob> {
    const enCurso = await this.versiones.findOne({ where: { estado: 'entrenando' } });
    if (enCurso) throw new ConflictoException('Ya hay un reentrenamiento en curso');

    const vigente = await this.vigente();
    const version = this.siguienteVersion(vigente.version);
    const eventos = (await this.estadoDatos()).eventos;
    /* Variación determinista: la mejora depende sólo del volumen de eventos. */
    const paso = ((eventos % 7) + 1) / 100;

    await this.versiones.save(
      this.versiones.create({
        version,
        entrenadoEn: hoyIso(),
        eventos,
        auc: Math.min(0.99, redondear(vigente.auc + paso, 2)),
        f1: Math.min(0.99, redondear(vigente.f1 + paso / 2, 2)),
        precision: Math.min(99, redondear(vigente.precision + paso * 100, 0)),
        recall: Math.min(99, redondear(vigente.recall + paso * 80, 0)),
        features: vigente.features,
        algoritmo: vigente.algoritmo,
        alertas30d: vigente.alertas30d,
        estado: 'entrenando',
        orden: -1,
      }),
    );

    setTimeout(() => {
      void this.finalizarEntrenamiento(version).catch((error: unknown) => {
        this.logger.error(`Fallo al activar ${version}`, error as Error);
      });
    }, DURACION_REENTRENAMIENTO_MS);

    return {
      id: `RET-${version.replace(/\./g, '')}`,
      estado: 'entrenando',
      version,
      iniciadoEn: ahoraIso(),
      mensaje: `Reentrenando el modelo con ${this.miles(eventos)} eventos; estará vigente en unos segundos`,
    };
  }

  private async finalizarEntrenamiento(version: string): Promise<void> {
    const nueva = await this.versiones.findOne({ where: { version } });
    if (!nueva) return;
    await this.archivarVigentes();
    nueva.estado = 'vigente';
    nueva.orden = 0;
    await this.versiones.save(nueva);
    await this.reordenar();
    this.logger.log(`Modelo ${version} vigente`);
  }

  async activar(version: string): Promise<Modelo> {
    const objetivo = await this.versiones.findOne({ where: { version } });
    if (!objetivo) throw new NoEncontradoException('Versión del modelo');
    if (objetivo.estado === 'entrenando') {
      throw new ConflictoException('La versión aún se está entrenando');
    }
    await this.archivarVigentes();
    objetivo.estado = 'vigente';
    await this.versiones.save(objetivo);
    await this.reordenar();
    return this.modelo();
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  private async archivarVigentes(): Promise<void> {
    const vigentes = await this.versiones.find({ where: { estado: 'vigente' } });
    for (const v of vigentes) v.estado = 'archivada';
    if (vigentes.length) await this.versiones.save(vigentes);
  }

  /** Deja la versión vigente primero y las archivadas por fecha descendente. */
  private async reordenar(): Promise<void> {
    const filas = await this.versiones.find();
    const ordenadas = filas.sort((a, b) => {
      if (a.estado === 'vigente') return -1;
      if (b.estado === 'vigente') return 1;
      return b.entrenadoEn.localeCompare(a.entrenadoEn);
    });
    ordenadas.forEach((v, i) => (v.orden = i));
    await this.versiones.save(ordenadas);
  }

  private async vigente(): Promise<ModeloVersion> {
    const vigente = await this.versiones.findOne({ where: { estado: 'vigente' } });
    if (vigente) return vigente;
    const cualquiera = await this.versiones.findOne({ where: {}, order: { orden: 'ASC' } });
    if (!cualquiera) throw new NoEncontradoException('Modelo predictivo');
    return cualquiera;
  }

  private async epActual(): Promise<number> {
    const totales = await this.registrosEp.count();
    const correctas = await this.registrosEp.countBy({ acierto: true });
    return calcEp(correctas, totales);
  }

  /** `v3.2` → `v3.3`. */
  private siguienteVersion(actual: string): string {
    const [mayor = '3', menor = '0'] = actual.replace(/^v/, '').split('.');
    return `v${mayor}.${Number(menor) + 1}`;
  }

  private miles(valor: number): string {
    return valor.toLocaleString('es-PE').replace(/,/g, ' ');
  }

  private decimal(valor: number): string {
    return valor.toFixed(2).replace('.', ',');
  }
}
