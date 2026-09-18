import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { IndicadorDiario, Prediccion } from '../../../database/entities';

/** Pliegues expansivos de la validación walk-forward (§6.2). */
export const PLIEGUES = 5;

/**
 * Fracción de días que quedan fuera en el corte temporal único 70/30.
 * Exportada: `EntrenamientoContinuoService` la reutiliza para construir el
 * `pruebaDesde` que manda a Python, en vez de duplicar el número.
 */
export const FRACCION_PRUEBA = 0.3;

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

/** Pliegue walk-forward expansivo en la forma que espera `POST /entrenar` (contrato Python §3). */
export interface PliegueEvaluacion {
  entrenamientoHasta: string;
  validacionDesde: string;
  validacionHasta: string;
}

/**
 * Reparte los días en `n` bloques contiguos de tamaño lo más parejo posible.
 *
 * **Función pura**, exportada a propósito (antes vivía como método privado):
 * `EntrenamientoContinuoService` la usa para construir los mismos cortes que
 * le manda a Python y, sobre todo, para verificar que los `pliegues[]` que
 * Python dice haber usado de verdad son los mismos — el guardarraíl contra un
 * off-by-one en el puerto que produciría métricas no comparables (§3 del
 * contrato).
 */
export function repartir(dias: readonly string[], n: number): string[][] {
  const bloques: string[][] = Array.from({ length: n }, () => []);
  const tamano = dias.length / n;
  dias.forEach((dia, i) => {
    const indice = Math.min(n - 1, Math.floor(i / tamano));
    bloques[indice]!.push(dia);
  });
  return bloques;
}

/**
 * `n` pliegues expansivos ya en la forma `{entrenamientoHasta, validacionDesde,
 * validacionHasta}` del contrato. Reutiliza `repartir` sobre `n + 1` bloques:
 * el primero es sólo el arranque del histórico y nunca se evalúa.
 */
export function pliegues(dias: readonly string[], n: number): PliegueEvaluacion[] {
  if (dias.length < n + 1) return [];
  const bloques = repartir(dias, n + 1);
  const salida: PliegueEvaluacion[] = [];
  for (let k = 0; k < n; k += 1) {
    const validacion = bloques[k + 1]!;
    if (!validacion.length) continue;
    salida.push({
      entrenamientoHasta: bloques[k]!.at(-1)!,
      validacionDesde: validacion[0]!,
      validacionHasta: validacion.at(-1)!,
    });
  }
  return salida;
}

/**
 * Corte temporal único 70/30 por días (§6.2): última fecha de entrenamiento y
 * primera de prueba. Función pura, misma partición que usa
 * `DatasetBuilderService` para fijar el target (`FRACCION_PRUEBA_TARGET`) — si
 * alguna vez divergen, el target vería el futuro.
 */
export function cortesTemporales(
  dias: readonly string[],
  fraccionPrueba: number,
): { corteEntrenamiento: string; pruebaDesde: string; cortePrueba: string } {
  const corte = Math.max(1, Math.floor(dias.length * (1 - fraccionPrueba)));
  const hasta = dias[corte - 1] ?? '';
  const pruebaDesde = dias[corte] ?? hasta;
  const fin = dias.at(-1) ?? '';
  return { corteEntrenamiento: hasta, pruebaDesde, cortePrueba: fin };
}

/**
 * Backtest y utilidades de partición temporal (§6 del plan de IA).
 *
 * **Python es el único motor de modelado (F5):** la validación walk-forward
 * en sí (entrenar N pliegues de un clasificador local) se retiró junto con el
 * entrenador TS heredado — hoy la corre `services/prediccion-py` dentro de
 * `POST /entrenar`. Lo que se conserva aquí es lo que `EntrenamientoContinuoService`
 * sigue reutilizando de verdad:
 *
 * 1. Los **mismos cortes temporales** (`repartir`, `pliegues`, `cortesTemporales`)
 *    que Nest manda a Python y contra los que verifica los `pliegues[]` que
 *    Python dice haber usado (guardarraíl anti off-by-one, §3 del contrato).
 * 2. El **backtest**: convierte las probabilidades fuera de muestra que
 *    devuelve Python en filas de `prediccion` con su acierto, y con ellas
 *    llena la serie predicho vs real.
 */
@Injectable()
export class EvaluacionService {
  private readonly logger = new Logger(EvaluacionService.name);

  constructor(
    @InjectRepository(Prediccion) private readonly predicciones: Repository<Prediccion>,
    @InjectRepository(IndicadorDiario) private readonly diarios: Repository<IndicadorDiario>,
  ) {}

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
