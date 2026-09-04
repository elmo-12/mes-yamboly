import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Alerta as AlertaDto, AlertaLinea } from '@mes/types';
import type { AlertsLookup } from '../../common/services/alerts-lookup';
import { Alerta } from '../../database/entities';
import { aAlertaDto } from './alerts.mapper';

/**
 * Consulta de sólo lectura que `realtime` usa para saber si una línea tiene
 * alerta activa (tarjeta de línea en estado `alerta` y badge del Modo TV).
 */
@Injectable()
export class AlertsLookupService implements AlertsLookup {
  constructor(@InjectRepository(Alerta) private readonly alertas: Repository<Alerta>) {}

  /** Alerta activa de mayor severidad de la línea, o `null` si no hay ninguna. */
  async findActivaPorLinea(lineaId: string): Promise<AlertaDto | null> {
    const activas = await this.alertas.find({ where: { lineaId, estado: 'activa' } });
    if (!activas.length) return null;
    const peso = { critica: 3, alta: 2, media: 1 } as const;
    const elegida = activas.sort(
      (a, b) => peso[b.severidad] - peso[a.severidad] || b.probabilidad - a.probabilidad,
    )[0]!;
    return aAlertaDto(elegida);
  }

  /** Versión por lotes para el tablero de tiempo real (una consulta, N líneas). */
  async findActivasPorLineas(lineaIds: string[]): Promise<Record<string, AlertaDto>> {
    if (!lineaIds.length) return {};
    const activas = await this.alertas.find({
      where: { lineaId: In(lineaIds), estado: 'activa' },
    });
    const peso = { critica: 3, alta: 2, media: 1 } as const;
    const mapa: Record<string, Alerta> = {};
    for (const alerta of activas) {
      const previa = mapa[alerta.lineaId];
      if (!previa || peso[alerta.severidad] > peso[previa.severidad]) mapa[alerta.lineaId] = alerta;
    }
    return Object.fromEntries(Object.entries(mapa).map(([id, a]) => [id, aAlertaDto(a)]));
  }

  /**
   * Implementación del contrato `AlertsLookup` que consume `realtime`:
   * alerta activa de mayor riesgo por línea, indexada por `lineaId`.
   */
  async activasPorLinea(): Promise<Map<string, AlertaLinea>> {
    const activas = await this.alertas.find({ where: { estado: 'activa' } });
    const peso = { critica: 3, alta: 2, media: 1 } as const;
    const mapa = new Map<string, Alerta>();
    for (const alerta of activas) {
      const previa = mapa.get(alerta.lineaId);
      if (
        !previa ||
        peso[alerta.severidad] > peso[previa.severidad] ||
        (peso[alerta.severidad] === peso[previa.severidad] && alerta.probabilidad > previa.probabilidad)
      ) {
        mapa.set(alerta.lineaId, alerta);
      }
    }
    return new Map(
      [...mapa].map(([lineaId, a]) => [
        lineaId,
        {
          id: a.id,
          riesgo: a.probabilidad,
          texto: a.prediccion,
          generadaEn: a.generadaEn,
        } satisfies AlertaLinea,
      ]),
    );
  }

  /** `true` si la línea tiene al menos una alerta activa. */
  async tieneAlertaActiva(lineaId: string): Promise<boolean> {
    return (await this.alertas.countBy({ lineaId, estado: 'activa' })) > 0;
  }
}
