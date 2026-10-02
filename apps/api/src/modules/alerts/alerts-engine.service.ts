import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { calcDesvioVelocidad } from '@mes/shared';
import type { Alerta as AlertaDto, SeveridadAlerta, TipoAlerta } from '@mes/types';
import { ahoraIso, esClaveDuplicada, insertarCopia } from '../../common/utils';
import { Alerta, Umbrales } from '../../database/entities';
import { aAlertaDto } from './alerts.mapper';
import {
  PREDICTION_PROVIDER,
  type PredictionContext,
  type PredictionProvider,
} from './prediction';

/** Señal cruda que el motor evalúa contra los umbrales configurados. */
export interface SenalLinea {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  turno: string;
  /** Velocidad real en u/min del último registro. */
  velocidadReal: number;
  velocidadEstandar: number;
  /** OEE acumulado del turno en %. */
  oeeActual: number;
  eventos7d: number;
  eventos30d: number;
  minutosDesdeCambio: number;
}

/** Minutos de la ventana de anticipación de cada tipo de alerta. */
const VENTANA_MIN: Record<TipoAlerta, number> = {
  parada_prevista: 40,
  merma_prevista: 240,
  velocidad_baja: 100,
  oee_bajo: 480,
};

@Injectable()
export class AlertsEngineService {
  private readonly logger = new Logger(AlertsEngineService.name);

  constructor(
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
    @InjectRepository(Umbrales) private readonly umbrales: Repository<Umbrales>,
    @Inject(PREDICTION_PROVIDER) private readonly prediccion: PredictionProvider,
  ) {}

  /**
   * Evalúa una señal contra los umbrales y, si alguna regla dispara, pide la
   * probabilidad al `PredictionProvider`. La alerta sólo se crea cuando la
   * probabilidad supera `probabilidadMinima`.
   */
  async evaluar(senal: SenalLinea): Promise<AlertaDto[]> {
    const umbrales = await this.umbrales.findOne({ where: { id: 'UMB-01' } });
    if (!umbrales) return [];

    const desvio = calcDesvioVelocidad(senal.velocidadReal, senal.velocidadEstandar);
    const disparos: { tipo: TipoAlerta; severidad: SeveridadAlerta; texto: string }[] = [];

    if (desvio <= -umbrales.velocidadBajoEstandarPct) {
      disparos.push({
        tipo: 'velocidad_baja',
        severidad: desvio <= -umbrales.velocidadBajoEstandarPct * 2 ? 'alta' : 'media',
        texto: `Velocidad ${Math.abs(Math.round(desvio))} % bajo estándar en ${senal.lineaCodigo} (turno anterior)`,
      });
    }

    if (senal.oeeActual > 0 && senal.oeeActual < umbrales.oeeMinimo) {
      disparos.push({
        tipo: 'oee_bajo',
        severidad: senal.oeeActual < umbrales.oeeMinimo - 10 ? 'alta' : 'media',
        texto: `OEE del turno anterior bajo ${umbrales.oeeMinimo} % en ${senal.lineaCodigo}`,
      });
    }

    if (senal.eventos7d >= 3) {
      disparos.push({
        tipo: 'parada_prevista',
        severidad: senal.eventos7d >= 5 ? 'critica' : 'alta',
        texto: `Parada por falla (PN-02) en ${senal.lineaCodigo} en ${VENTANA_MIN.parada_prevista} min`,
      });
    }

    const creadas: AlertaDto[] = [];
    for (const disparo of disparos) {
      const ctx: PredictionContext = {
        tipo: disparo.tipo,
        lineaId: senal.lineaId,
        lineaCodigo: senal.lineaCodigo,
        turno: senal.turno,
        eventos7d: senal.eventos7d,
        eventos30d: senal.eventos30d,
        desvioVelocidadPct: desvio,
        oeeActual: senal.oeeActual,
        minutosDesdeCambio: senal.minutosDesdeCambio,
      };
      const { probabilidad, factores } = await this.prediccion.predict(ctx);
      if (probabilidad < umbrales.probabilidadMinima) continue;

      const ahora = new Date();
      const fin = new Date(ahora.getTime() + VENTANA_MIN[disparo.tipo] * 60000);
      const alerta = this.alertas.create({
        id: '',
        tipo: disparo.tipo,
        severidad: disparo.severidad,
        lineaId: senal.lineaId,
        lineaCodigo: senal.lineaCodigo,
        lineaNombre: senal.lineaNombre,
        prediccion: disparo.texto,
        probabilidad,
        ventanaInicio: ahoraIso(ahora),
        ventanaFin: ahoraIso(fin),
        estado: 'activa',
        acierto: null,
        factores,
        generadaEn: ahoraIso(ahora),
      });
      await this.insertarConIdUnico(alerta, disparo.tipo);
      creadas.push(aAlertaDto(alerta));
    }

    if (creadas.length) {
      this.logger.log(
        `${creadas.length} alerta(s) generada(s) en ${senal.lineaCodigo} vía ${this.prediccion.nombre}`,
      );
    }
    return creadas;
  }

  /**
   * Marca como `vencida` toda alerta activa cuya ventana ya pasó. Es un UPDATE
   * condicionado a `estado = 'activa'`: antes se cargaban las entidades y se
   * guardaban enteras, de modo que una alerta atendida entre la lectura y el
   * guardado volvía a quedar `vencida` y perdía la acción registrada.
   */
  async vencerCaducadas(): Promise<number> {
    const resultado = await this.alertas
      .createQueryBuilder()
      .update(Alerta)
      .set({ estado: 'vencida' })
      .where('estado = :activa', { activa: 'activa' })
      .andWhere('ventanaFin < :ahora', { ahora: ahoraIso() })
      .execute();
    return resultado.affected ?? 0;
  }

  /**
   * `ALE-<marca de tiempo><sufijo aleatorio>-<tipo>`. Se inserta (nunca
   * `save()`, que con un id repetido hace UPDATE y pisa otra alerta) y, si el
   * id ya existe, se reintenta con otro sufijo.
   */
  private async insertarConIdUnico(alerta: Alerta, tipo: string): Promise<void> {
    for (let intento = 0; intento < 5; intento++) {
      const sufijo = Math.random().toString(36).slice(2, 4).toUpperCase();
      alerta.id = `ALE-${Date.now().toString(36).toUpperCase()}${sufijo}-${tipo.slice(0, 3)}`;
      try {
        await insertarCopia(this.alertas, alerta);
        return;
      } catch (error) {
        if (!esClaveDuplicada(error) || intento === 4) throw error;
      }
    }
  }
}
