import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FactorAlerta } from '@mes/types';
import { ModeloVersion } from '../../../database/entities';
import {
  etiquetaDeFeature,
  nombreFeatureLinea,
  vectorizarParcial,
} from '../../analytics/dataset/features';
import { contribuciones, predecirProba } from '../../analytics/modelado/regresion-logistica';
import type { PredictionContext, PredictionProvider, PredictionResult } from './prediction.provider';

/** Segundos que se cachean los pesos antes de releerlos de `modelo_version`. */
const TTL_CACHE_MS = 60_000;

/**
 * Nivel 2 de la cascada (§5.2 del plan de IA): aplica los pesos de la regresión
 * logística entrenada sobre el feature store.
 *
 * Cuando el contexto trae `features` (lo normal desde el ciclo de inferencia) se
 * puntúa el vector completo. Cuando llega el contexto estrecho del motor de
 * alertas se rellena lo conocido y el resto toma la media de entrenamiento, que
 * es la lectura correcta de «no sé» en un modelo estandarizado.
 */
@Injectable()
export class ModeloLocalPredictionProvider implements PredictionProvider {
  readonly nombre = 'modelo-local';
  private readonly logger = new Logger(ModeloLocalPredictionProvider.name);
  private cache: { version: ModeloVersion | null; expira: number } = { version: null, expira: 0 };

  constructor(@InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>) {}

  /** `null` si todavía no hay una versión vigente con pesos: la cascada sigue. */
  async intentar(ctx: PredictionContext): Promise<PredictionResult | null> {
    const version = await this.vigente();
    const coeficientes = version?.coeficientes;
    if (!version || !coeficientes?.nombres?.length) return null;

    const modelo = {
      nombres: coeficientes.nombres,
      pesos: coeficientes.pesos,
      sesgo: coeficientes.sesgo,
      medias: coeficientes.medias,
      desviaciones: coeficientes.desviaciones,
      lambdaL2: coeficientes.lambdaL2,
      iteraciones: coeficientes.iteraciones,
    };
    const x = vectorizarParcial(this.features(ctx), modelo.nombres, modelo.medias);
    const probabilidad = Math.round(predecirProba(modelo, x) * 1000) / 10;

    const positivas = contribuciones(modelo, x)
      .filter((c) => c.contribucion > 0)
      .slice(0, 3);
    return { probabilidad, factores: this.normalizar(positivas) };
  }

  /** El contrato obliga a devolver algo; sin modelo la probabilidad es 0. */
  async predict(ctx: PredictionContext): Promise<PredictionResult> {
    return (await this.intentar(ctx)) ?? { probabilidad: 0, factores: [] };
  }

  /** Invalida la caché tras un reentrenamiento, sin esperar al TTL. */
  invalidar(): void {
    this.cache = { version: null, expira: 0 };
  }

  private async vigente(): Promise<ModeloVersion | null> {
    if (Date.now() < this.cache.expira) return this.cache.version;
    const version = await this.versiones
      .findOne({ where: { estado: 'vigente', objetivo: 'parada_imprevista' } })
      .catch((error: unknown) => {
        this.logger.warn(`No se pudo leer el modelo vigente: ${(error as Error).message}`);
        return null;
      });
    this.cache = { version, expira: Date.now() + TTL_CACHE_MS };
    return version;
  }

  /** Traduce el contexto estrecho del motor de alertas a nombres de feature. */
  private features(ctx: PredictionContext): Record<string, number> {
    if (ctx.features) return ctx.features;
    return {
      paradasImprev7d: ctx.eventos7d,
      paradasImprev30d: ctx.eventos30d,
      desvioVelocidadTurnoPrevio: ctx.desvioVelocidadPct,
      oeeTurnoPrevio: ctx.oeeActual,
      turnoEsNoche: ctx.turno === 'N' ? 1 : 0,
      [nombreFeatureLinea(ctx.lineaCodigo)]: 1,
    };
  }

  /** Reparte las contribuciones sobre 100, como ya hace el proveedor de reglas. */
  private normalizar(crudos: { nombre: string; contribucion: number }[]): FactorAlerta[] {
    const total = crudos.reduce((a, f) => a + f.contribucion, 0);
    if (total <= 0) return [];
    const factores = crudos.map((f) => ({
      texto: etiquetaDeFeature(f.nombre),
      contribucion: Math.round((f.contribucion / total) * 100),
    }));
    const suma = factores.reduce((a, f) => a + f.contribucion, 0);
    if (factores[0]) factores[0].contribucion += 100 - suma;
    return factores;
  }
}
