import { Injectable, Logger } from '@nestjs/common';
import type { FactorAlerta } from '@mes/types';
import { RuleBasedPredictionProvider } from './rule-based.provider';
import type { PredictionContext, PredictionProvider, PredictionResult } from './prediction.provider';

interface RespuestaPython {
  probabilidad?: unknown;
  factores?: unknown;
}

/** Error de HTTP que conserva el status para distinguir rechazos de negocio
 * (4xx: `422` por tipo no soportado, cada 15 min es normal) de caídas reales
 * del servicio (5xx, red, timeout). */
class ErrorHttpPrediccion extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  /** 4xx: el servicio respondió, sólo rechazó la petición (p. ej. tipo distinto
   * de `parada_prevista`). No indica que Python esté caído. */
  get esRechazoDeNegocio(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

type EstadoCircuito = 'cerrado' | 'abierto' | 'medio-abierto';

/** Fallos consecutivos (no de negocio) que abren el circuito. */
const UMBRAL_FALLOS_POR_DEFECTO = 3;
/** Cuánto se mantiene abierto el circuito antes de dejar pasar una petición de prueba. */
const PERIODO_ABIERTO_MS_POR_DEFECTO = 60_000;

/**
 * Puente con el servicio de inferencia en Python (`PREDICTION_SERVICE_URL`).
 * Si la variable no está definida, la llamada falla o la respuesta es inválida,
 * cae a `null` para que la cascada baje de nivel (a reglas).
 *
 * Circuit breaker: sin él, con Python caído el ciclo de inferencia paga hasta
 * 9 timeouts seriales de `timeoutMs` por vuelta (una por línea, evaluadas en
 * secuencia por `RiesgoService`). Tras `umbralFallos` fallos *de servicio*
 * consecutivos (no de negocio: un 422 no cuenta) el circuito se abre durante
 * `periodoAbiertoMs` y `intentar()` devuelve `null` sin hacer `fetch`; pasado
 * ese plazo deja pasar una única petición de prueba (medio-abierto) que, si
 * tiene éxito, cierra el circuito, y si falla, lo reabre con un nuevo plazo.
 */
@Injectable()
export class PythonHttpPredictionProvider implements PredictionProvider {
  readonly nombre = 'python-http';
  private readonly logger = new Logger(PythonHttpPredictionProvider.name);

  private estado: EstadoCircuito = 'cerrado';
  private fallosConsecutivos = 0;
  private abiertoHasta = 0;

  constructor(
    private readonly fallback: RuleBasedPredictionProvider,
    private readonly url = process.env.PREDICTION_SERVICE_URL,
    private readonly timeoutMs = Number(process.env.PREDICTION_TIMEOUT_MS ?? 1500),
    private readonly umbralFallos = Number(
      process.env.PREDICTION_BREAKER_UMBRAL ?? UMBRAL_FALLOS_POR_DEFECTO,
    ),
    private readonly periodoAbiertoMs = Number(
      process.env.PREDICTION_BREAKER_PERIODO_MS ?? PERIODO_ABIERTO_MS_POR_DEFECTO,
    ),
  ) {}

  async predict(ctx: PredictionContext): Promise<PredictionResult> {
    return (await this.intentar(ctx)) ?? this.fallback.predict(ctx);
  }

  /**
   * Devuelve `null` —en vez de caer en reglas— cuando el servicio no está o no
   * responde, para que la cascada registre el nivel correcto.
   */
  async intentar(ctx: PredictionContext): Promise<PredictionResult | null> {
    if (!this.url) return null;
    if (this.circuitoAbierto()) return null;

    const abort = new AbortController();
    const temporizador = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const respuesta = await fetch(`${this.url.replace(/\/$/, '')}/predict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ctx),
        signal: abort.signal,
      });
      if (!respuesta.ok) throw new ErrorHttpPrediccion(respuesta.status, `HTTP ${respuesta.status}`);
      const cuerpo = (await respuesta.json()) as RespuestaPython;
      const resultado = this.validar(cuerpo);
      this.registrarExito();
      return resultado;
    } catch (error: unknown) {
      this.registrarFallo(error);
      return null;
    } finally {
      clearTimeout(temporizador);
    }
  }

  /** Valida forma y rango; lanza si la respuesta no es utilizable. */
  private validar(cuerpo: RespuestaPython): PredictionResult {
    const probabilidad = cuerpo.probabilidad;
    if (typeof probabilidad !== 'number' || !Number.isFinite(probabilidad) || probabilidad < 0 || probabilidad > 100) {
      throw new Error(`probabilidad inválida: ${JSON.stringify(probabilidad)}`);
    }
    if (!Array.isArray(cuerpo.factores)) {
      throw new Error('factores no es un array');
    }
    const factores = cuerpo.factores.map((factor, indice) => this.validarFactor(factor, indice));
    return { probabilidad, factores };
  }

  private validarFactor(factor: unknown, indice: number): FactorAlerta {
    const f = factor as Partial<FactorAlerta> | null | undefined;
    if (!f || typeof f.texto !== 'string') {
      throw new Error(`factor[${indice}].texto inválido`);
    }
    const contribucion = f.contribucion;
    if (
      typeof contribucion !== 'number' ||
      !Number.isFinite(contribucion) ||
      contribucion < 0 ||
      contribucion > 100
    ) {
      throw new Error(`factor[${indice}].contribucion inválida: ${JSON.stringify(contribucion)}`);
    }
    return { texto: f.texto, contribucion };
  }

  private registrarExito(): void {
    this.fallosConsecutivos = 0;
    this.estado = 'cerrado';
  }

  private registrarFallo(error: unknown): void {
    const esErrorHttp = error instanceof ErrorHttpPrediccion;
    const esRechazoDeNegocio = esErrorHttp && error.esRechazoDeNegocio;
    const mensaje = (error as Error).message;

    if (esRechazoDeNegocio) {
      /* 422 por tipo no soportado: el motor de alertas llama con velocidad_baja
       * u oee_bajo cada 15 min y Python los rechaza a propósito; no es una
       * caída y no debe ni ensuciar el log en `warn` ni contar para el breaker. */
      this.logger.debug(`Servicio de predicción rechazó la petición (${mensaje})`);
      return;
    }

    this.logger.warn(`Servicio de predicción no disponible (${mensaje}); se baja de nivel`);
    this.fallosConsecutivos += 1;
    if (this.estado === 'medio-abierto' || this.fallosConsecutivos >= this.umbralFallos) {
      this.estado = 'abierto';
      this.abiertoHasta = this.ahora() + this.periodoAbiertoMs;
    }
  }

  /** `true` si hay que devolver `null` sin llegar a hacer `fetch`. Al vencer el
   * plazo, pasa a medio-abierto y deja pasar una única petición de prueba. */
  private circuitoAbierto(): boolean {
    if (this.estado !== 'abierto') return false;
    if (this.ahora() >= this.abiertoHasta) {
      this.estado = 'medio-abierto';
      return false;
    }
    return true;
  }

  /** Punto único de reloj, sobrescribible en tests. */
  protected ahora(): number {
    return Date.now();
  }
}
