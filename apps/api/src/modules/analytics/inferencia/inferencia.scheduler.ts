import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicadorDiario, ModeloVersion, Prediccion } from '../../../database/entities';
import { EvaluacionService } from '../modelado';
import { RiesgoService } from './riesgo.service';

/**
 * El scheduler se apaga con `INFERENCIA_ACTIVA=false` y **nunca** arranca en los
 * e2e: un cron corriendo durante las pruebas crearía alertas de forma no
 * determinista y dejaría temporizadores vivos al cerrar la app (R8).
 */
export function inferenciaActiva(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  return process.env.INFERENCIA_ACTIVA !== 'false';
}

/**
 * Fase 6 de CRISP-DM. Dos crones:
 *
 * - cada 15 min, el ciclo de inferencia que puntúa las 9 líneas del turno
 *   siguiente, escribe `prediccion` y dispara el motor de alertas;
 * - a las 06:15, el cierre del día: contrasta las predicciones del turno que
 *   acaba de terminar contra las paradas registradas y actualiza la serie
 *   predicho vs real.
 */
@Injectable()
export class InferenciaSchedulerService {
  private readonly logger = new Logger(InferenciaSchedulerService.name);
  private enCurso = false;

  constructor(
    private readonly riesgo: RiesgoService,
    private readonly evaluacion: EvaluacionService,
    @InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>,
    @InjectRepository(Prediccion) private readonly predicciones: Repository<Prediccion>,
    @InjectRepository(IndicadorDiario) private readonly diarios: Repository<IndicadorDiario>,
  ) {}

  @Cron('*/15 * * * *', { name: 'inferencia-15min' })
  async ciclo(): Promise<void> {
    if (!inferenciaActiva() || this.enCurso) return;
    this.enCurso = true;
    try {
      await this.riesgo.ejecutarCiclo();
    } catch (error: unknown) {
      this.logger.error(`Ciclo de inferencia fallido: ${(error as Error).message}`);
    } finally {
      this.enCurso = false;
    }
  }

  @Cron('15 6 * * *', { name: 'backtest-diario' })
  async cierreDiario(): Promise<void> {
    if (!inferenciaActiva()) return;
    try {
      const cerradas = await this.cerrarBacktest();
      this.logger.log(`Cierre diario: ${cerradas} predicciones contrastadas`);
    } catch (error: unknown) {
      this.logger.error(`Cierre diario fallido: ${(error as Error).message}`);
    }
  }

  /**
   * Contrasta las predicciones en vivo ya vencidas con lo que registró la planta
   * y refresca `indicador_diario.prediccionesPredichas/Reales` de los días
   * afectados — que es lo que convierte la serie de la pestaña Predicciones en
   * un dato medido y no en una curva sembrada.
   */
  async cerrarBacktest(): Promise<number> {
    const version = await this.versiones.findOne({ where: { estado: 'vigente' } });
    const umbral = (version?.umbralDecision ?? 50) / 100;
    const observados = await this.riesgo.observados();
    const cerradas = await this.evaluacion.cerrarPrediccionesVivas(observados, umbral);

    const filas = await this.predicciones.find();
    const porDia = new Map<string, { predicho: number; real: number }>();
    for (const [clave, real] of observados) {
      const fecha = clave.split('|')[1] ?? '';
      const acumulado = porDia.get(fecha) ?? { predicho: 0, real: 0 };
      if (real.ocurrio) acumulado.real += 1;
      porDia.set(fecha, acumulado);
    }
    for (const p of filas) {
      const acumulado = porDia.get(p.fecha);
      if (acumulado && p.probabilidad >= umbral * 100) acumulado.predicho += 1;
    }
    const dias = await this.diarios.find();
    for (const d of dias) {
      const acumulado = porDia.get(d.fecha);
      if (!acumulado) continue;
      d.prediccionesPredichas = acumulado.predicho;
      d.prediccionesReales = acumulado.real;
    }
    if (dias.length) await this.diarios.save(dias, { chunk: 100 });
    return cerradas;
  }
}
