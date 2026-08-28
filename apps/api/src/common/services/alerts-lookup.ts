import { Injectable } from '@nestjs/common';
import type { AlertaLinea } from '@mes/types';

/** Token de inyección del puente `realtime` → `alerts` (módulo de B2). */
export const ALERTS_LOOKUP = 'ALERTS_LOOKUP';

/**
 * Contrato mínimo que `realtime` necesita del módulo de alertas.
 * B1 registra `NullAlertsLookup`; B2 sustituye el proveedor en
 * `RealtimeModule` por una implementación respaldada por la tabla `alerta`.
 */
export interface AlertsLookup {
  /** Alerta activa de mayor riesgo por línea, indexada por `lineaId`. */
  activasPorLinea(): Promise<Map<string, AlertaLinea>>;
}

/** Implementación neutra: sin alertas mientras B2 no engancha su módulo. */
@Injectable()
export class NullAlertsLookup implements AlertsLookup {
  activasPorLinea(): Promise<Map<string, AlertaLinea>> {
    return Promise.resolve(new Map());
  }
}
