import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { calcDesvioVelocidad } from '@mes/shared';
import type { Alerta as AlertaDto, SeveridadAlerta, TipoAlerta } from '@mes/types';
import { ahoraIso } from '../../common/utils';
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
  maquinaId?: string;
  maquinaNombre?: string;
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
        texto: `Velocidad ${Math.abs(Math.round(desvio))} % bajo estándar en ${senal.lineaCodigo}`,
      });
    }

    if (senal.oeeActual > 0 && senal.oeeActual < umbrales.oeeMinimo) {
      disparos.push({
        tipo: 'oee_bajo',
        severidad: senal.oeeActual < umbrales.oeeMinimo - 10 ? 'alta' : 'media',
        texto: `OEE del turno bajo ${umbrales.oeeMinimo} % en ${senal.lineaCodigo}`,
      });
    }

    if (senal.eventos7d >= 3) {
      disparos.push({
        tipo: 'parada_prevista',
        severidad: senal.eventos7d >= 5 ? 'critica' : 'alta',
        texto: `Parada PM-01 en ${senal.lineaCodigo} en ${VENTANA_MIN.parada_prevista} min`,
      });
    }

    const creadas: AlertaDto[] = [];
    for (const disparo of disparos) {
      const ctx: PredictionContext = {
        tipo: disparo.tipo,
        lineaId: senal.lineaId,
        lineaCodigo: senal.lineaCodigo,
        maquinaId: senal.maquinaId,
        maquinaNombre: senal.maquinaNombre,
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
      const alerta = await this.alertas.save(
        this.alertas.create({
          id: `ALE-${Date.now().toString(36).toUpperCase()}-${disparo.tipo.slice(0, 3)}`,
          tipo: disparo.tipo,
          severidad: disparo.severidad,
          lineaId: senal.lineaId,
          lineaCodigo: senal.lineaCodigo,
          lineaNombre: senal.lineaNombre,
          maquinaId: senal.maquinaId ?? null,
          maquinaNombre: senal.maquinaNombre ?? null,
          prediccion: disparo.texto,
          probabilidad,
          ventanaInicio: ahoraIso(ahora),
          ventanaFin: ahoraIso(fin),
          estado: 'activa',
          acierto: null,
          factores,
          generadaEn: ahoraIso(ahora),
        }),
      );
      creadas.push(aAlertaDto(alerta));
    }

    if (creadas.length) {
      this.logger.log(
        `${creadas.length} alerta(s) generada(s) en ${senal.lineaCodigo} vía ${this.prediccion.nombre}`,
      );
    }
    return creadas;
  }

  /** Marca como `vencida` toda alerta activa cuya ventana ya pasó. */
  async vencerCaducadas(): Promise<number> {
    const ahora = ahoraIso();
    const activas = await this.alertas.find({ where: { estado: 'activa' } });
    const caducadas = activas.filter((a) => a.ventanaFin < ahora);
    for (const alerta of caducadas) alerta.estado = 'vencida';
    if (caducadas.length) await this.alertas.save(caducadas);
    return caducadas.length;
  }
}
