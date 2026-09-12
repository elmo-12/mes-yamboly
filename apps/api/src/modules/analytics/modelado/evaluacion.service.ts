import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { IndicadorDiario, Prediccion } from '../../../database/entities';
import type { MuestraCalculada } from '../dataset';
import { vectorizar } from '../dataset';
import {
  type MetricasClasificacion,
  evaluar,
  liftTopK,
  umbralOptimoF1,
} from './metricas';
import { type ModeloLogistico, entrenarLogistica, predecirProba } from './regresion-logistica';

/** Rejilla de regularización que se explora en la validación temporal. */
export const LAMBDAS = [0.5, 2, 8, 32, 128, 512, 2048] as const;

/** Pliegues expansivos de la validación walk-forward (§6.2). */
export const PLIEGUES = 5;

/** Fracción de días que quedan fuera en el corte temporal único 70/30. */
const FRACCION_PRUEBA = 0.3;

export interface ProbabilidadFuera {
  clave: string;
  lineaId: string;
  lineaCodigo: string;
  fecha: string;
  turno: string;
  y: number;
  p: number;
  minutosImprevistos: number;
}

export interface ResultadoEvaluacion {
  /** Métricas principales: walk-forward agrupando todos los pliegues. */
  walkForward: MetricasClasificacion;
  /** Umbral 0–1 elegido por F1 sobre las predicciones fuera de muestra. */
  umbral: number;
  liftTop3: number;
  lambda: number;
  /** AUC del corte temporal único, sin promediar pliegues. */
  aucPrueba: number;
  corteEntrenamiento: string;
  cortePrueba: string;
  /** Probabilidades fuera de muestra, una por turno evaluado. */
  fuera: ProbabilidadFuera[];
}

/**
 * Fase 5 de CRISP-DM. Dos cosas, y ninguna es opcional para que las cifras
 * sean creíbles:
 *
 * 1. **Validación temporal**, nunca aleatoria. Las features `7d`/`30d` miran al
 *    pasado de la propia línea; un `train_test_split` barajado filtraría el
 *    futuro por esa puerta y dejaría un AUC bonito e inservible.
 * 2. **Backtest**: convierte las probabilidades fuera de muestra en filas de
 *    `prediccion` con su acierto, y con ellas llena la serie predicho vs real.
 */
@Injectable()
export class EvaluacionService {
  private readonly logger = new Logger(EvaluacionService.name);

  constructor(
    @InjectRepository(Prediccion) private readonly predicciones: Repository<Prediccion>,
    @InjectRepository(IndicadorDiario) private readonly diarios: Repository<IndicadorDiario>,
  ) {}

  /**
   * Recorre la rejilla de lambdas con validación walk-forward y devuelve la
   * mejor. El hiperparámetro se elige sobre los mismos pliegues que luego se
   * reportan: es un sesgo optimista conocido, que se documenta en vez de
   * disimularlo — con este volumen de datos, reservar un tercer conjunto
   * dejaría los pliegues sin positivos.
   */
  evaluarModelo(muestras: readonly MuestraCalculada[], nombres: readonly string[]): ResultadoEvaluacion {
    let mejor: { lambda: number; fuera: ProbabilidadFuera[]; auc: number } | null = null;
    for (const lambda of LAMBDAS) {
      const fuera = this.walkForward(muestras, nombres, lambda);
      if (!fuera.length) continue;
      const area = evaluar(
        fuera.map((f) => f.y),
        fuera.map((f) => f.p),
        0.5,
      ).auc;
      if (!mejor || area > mejor.auc) mejor = { lambda, fuera, auc: area };
    }

    const fuera = mejor?.fuera ?? [];
    const y = fuera.map((f) => f.y);
    const p = fuera.map((f) => f.p);
    const umbral = y.length ? umbralOptimoF1(y, p) : 0.5;
    const walkForward = evaluar(y, p, umbral);
    const lift = liftTopK(
      fuera.map((f) => ({ clave: `${f.fecha}|${f.turno}`, y: f.y, p: f.p })),
      3,
    );

    const { aucPrueba, corteEntrenamiento, cortePrueba } = this.cortePrueba(
      muestras,
      nombres,
      mejor?.lambda ?? LAMBDAS[0],
    );

    return {
      walkForward,
      umbral,
      liftTop3: Math.round(lift * 100) / 100,
      lambda: mejor?.lambda ?? LAMBDAS[0],
      aucPrueba,
      corteEntrenamiento,
      cortePrueba,
      fuera,
    };
  }

  /**
   * Pliegues expansivos: se entrena con todos los días hasta el corte `k` y se
   * evalúan los días del bloque `k+1`; nunca al revés. Las predicciones de
   * todos los pliegues se agrupan porque con ~30 días un solo corte tiene
   * demasiada varianza para publicar una cifra.
   */
  walkForward(
    muestras: readonly MuestraCalculada[],
    nombres: readonly string[],
    lambda: number,
  ): ProbabilidadFuera[] {
    const dias = [...new Set(muestras.map((m) => m.fecha))].sort();
    if (dias.length < PLIEGUES + 1) return [];
    const bloques = this.repartir(dias, PLIEGUES + 1);

    const fuera: ProbabilidadFuera[] = [];
    for (let k = 0; k < PLIEGUES; k += 1) {
      const hasta = bloques[k]!.at(-1)!;
      const prueba = new Set(bloques[k + 1]!);
      const entrenamiento = muestras.filter((m) => m.fecha <= hasta);
      const validacion = muestras.filter((m) => prueba.has(m.fecha));
      const modelo = this.entrenar(entrenamiento, nombres, lambda);
      if (!modelo || !validacion.length) continue;
      for (const m of validacion) fuera.push(this.puntuar(modelo, m, nombres));
    }
    return fuera;
  }

  /** Corte único 70/30 por días, reportado junto al walk-forward (§6.2). */
  private cortePrueba(
    muestras: readonly MuestraCalculada[],
    nombres: readonly string[],
    lambda: number,
  ): { aucPrueba: number; corteEntrenamiento: string; cortePrueba: string } {
    const dias = [...new Set(muestras.map((m) => m.fecha))].sort();
    const corte = Math.max(1, Math.floor(dias.length * (1 - FRACCION_PRUEBA)));
    const hasta = dias[corte - 1] ?? '';
    const fin = dias.at(-1) ?? '';
    const entrenamiento = muestras.filter((m) => m.fecha <= hasta);
    const prueba = muestras.filter((m) => m.fecha > hasta);
    const modelo = this.entrenar(entrenamiento, nombres, lambda);
    if (!modelo || !prueba.length) {
      return { aucPrueba: 0, corteEntrenamiento: hasta, cortePrueba: fin };
    }
    const puntos = prueba.map((m) => this.puntuar(modelo, m, nombres));
    return {
      aucPrueba: evaluar(
        puntos.map((f) => f.y),
        puntos.map((f) => f.p),
        0.5,
      ).auc,
      corteEntrenamiento: hasta,
      cortePrueba: fin,
    };
  }

  /** Entrena sobre un subconjunto; devuelve `null` si no hay las dos clases. */
  entrenar(
    muestras: readonly MuestraCalculada[],
    nombres: readonly string[],
    lambda: number,
  ): ModeloLogistico | null {
    if (muestras.length < 10) return null;
    const y = muestras.map((m) => m.huboParadaImprevista);
    const clases = new Set(y);
    if (clases.size < 2) return null;
    const X = muestras.map((m) => vectorizar(m.features, nombres));
    return entrenarLogistica(X, y, [...nombres], { lambdaL2: lambda });
  }

  private puntuar(
    modelo: ModeloLogistico,
    m: MuestraCalculada,
    nombres: readonly string[],
  ): ProbabilidadFuera {
    return {
      clave: `${m.lineaId}|${m.fecha}|${m.turno}`,
      lineaId: m.lineaId,
      lineaCodigo: m.lineaCodigo,
      fecha: m.fecha,
      turno: m.turno,
      y: m.huboParadaImprevista,
      p: predecirProba(modelo, vectorizar(m.features, nombres)),
      minutosImprevistos: m.minutosImprevistos,
    };
  }

  /** Reparte los días en `n` bloques contiguos de tamaño lo más parejo posible. */
  private repartir(dias: string[], n: number): string[][] {
    const bloques: string[][] = Array.from({ length: n }, () => []);
    const tamano = dias.length / n;
    dias.forEach((dia, i) => {
      const indice = Math.min(n - 1, Math.floor(i / tamano));
      bloques[indice]!.push(dia);
    });
    return bloques;
  }

  /* ---------------------------------------------------------------- */
  /* Backtest                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Persiste las predicciones fuera de muestra como filas `origen='backtest'`
   * con su acierto, y actualiza `indicador_diario.prediccionesPredichas/Reales`.
   *
   * El backtest **nunca** escribe en `registro_ep`: la EP de la tesis se mide
   * sólo con confirmaciones humanas (§6.1, R10). Lo que se mide aquí es otra
   * cosa — la EP-backtest — y por eso vive en `prediccion.acierto`.
   */
  async registrarBacktest(
    fuera: readonly ProbabilidadFuera[],
    umbral: number,
    version: string,
  ): Promise<number> {
    await this.predicciones.delete({ origen: 'backtest' });
    const filas = fuera.map((f) => {
      const predicho = f.p >= umbral;
      const ocurrio = f.y === 1;
      return this.predicciones.create({
        id: `PRB-${f.lineaCodigo}-${f.fecha}-${f.turno}`,
        fecha: f.fecha,
        lineaCodigo: f.lineaCodigo,
        lineaId: f.lineaId,
        turnoObjetivo: f.turno === 'N' ? ('N' as const) : ('D' as const),
        tipo: 'Parada prevista',
        prediccion: predicho
          ? `Parada imprevista probable en ${f.lineaCodigo}`
          : `Turno sin parada imprevista en ${f.lineaCodigo}`,
        probabilidad: Math.round(f.p * 1000) / 10,
        eventoReal: ocurrio
          ? `Parada imprevista de ${Math.round(f.minutosImprevistos)} min`
          : 'Sin parada imprevista relevante',
        acierto: predicho === ocurrio,
        modeloVersion: version,
        origen: 'backtest' as const,
      });
    });
    await this.predicciones.save(filas, { chunk: 200 });

    /* La serie de la pestaña Predicciones compara, por día, cuántos turnos
     * marcó el modelo frente a cuántos pararon de verdad. */
    const porDia = new Map<string, { predicho: number; real: number }>();
    for (const f of fuera) {
      const acumulado = porDia.get(f.fecha) ?? { predicho: 0, real: 0 };
      if (f.p >= umbral) acumulado.predicho += 1;
      if (f.y === 1) acumulado.real += 1;
      porDia.set(f.fecha, acumulado);
    }
    const dias = await this.diarios.find();
    for (const d of dias) {
      const acumulado = porDia.get(d.fecha) ?? { predicho: 0, real: 0 };
      d.prediccionesPredichas = acumulado.predicho;
      d.prediccionesReales = acumulado.real;
    }
    if (dias.length) await this.diarios.save(dias, { chunk: 100 });

    this.logger.log(`Backtest: ${filas.length} predicciones contrastadas en ${porDia.size} días`);
    return filas.length;
  }

  /**
   * Cierra el backtest de las predicciones en vivo ya vencidas: compara cada
   * `prediccion` de origen `vivo` con lo que registró la planta en ese turno.
   */
  async cerrarPrediccionesVivas(
    observados: ReadonlyMap<string, { ocurrio: boolean; minutos: number }>,
    umbral: number,
  ): Promise<number> {
    const abiertas = await this.predicciones.find({ where: { origen: 'vivo', acierto: IsNull() } });
    const cerradas = abiertas.filter((p) =>
      observados.has(`${p.lineaId ?? ''}|${p.fecha}|${p.turnoObjetivo ?? ''}`),
    );
    for (const p of cerradas) {
      const real = observados.get(`${p.lineaId ?? ''}|${p.fecha}|${p.turnoObjetivo ?? ''}`)!;
      p.eventoReal = real.ocurrio
        ? `Parada imprevista de ${Math.round(real.minutos)} min`
        : 'Sin parada imprevista relevante';
      p.acierto = p.probabilidad >= umbral * 100 === real.ocurrio;
    }
    if (cerradas.length) await this.predicciones.save(cerradas);
    return cerradas.length;
  }
}
