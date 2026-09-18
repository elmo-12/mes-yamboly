import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ObjetivoModelo } from './modelo-version.entity';

/** Quién disparó la corrida: el cron semanal, el botón «Reentrenar» o el arranque en frío. */
export type DisparadorEntrenamiento = 'cron' | 'manual' | 'arranque';

export type EstadoEjecucion = 'en_curso' | 'completado' | 'omitido' | 'error';

export type DecisionPromocion = 'promovido' | 'incumbente' | 'sin_incumbente' | 'no_evaluado';

/** Resultado de la comparación campeón/retador de un objetivo concreto de la corrida. */
export interface ResultadoObjetivoEjecucion {
  objetivo: ObjetivoModelo;
  decision: DecisionPromocion;
  motivo: string;
  metricas?: Record<string, number>;
}

/**
 * Bitácora de cada corrida del orquestador de entrenamiento continuo
 * (`EntrenamientoContinuoService`). Es el histórico auditable que responde
 * «¿por qué v2.4 no quedó vigente?» sin tener que leer logs: una fila por
 * intento, completo o abortado.
 */
@Entity('entrenamiento_ejecucion')
export class EntrenamientoEjecucion {
  /** `EJEC-<version sin puntos>-<timestamp>`. */
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  disparador!: DisparadorEntrenamiento;

  @Column('text', { default: 'en_curso' })
  estado!: EstadoEjecucion;

  /** Versión candidata de esta corrida (`v2.4`), compartida por los 4 objetivos. */
  @Column('text')
  version!: string;

  /** Objetivo principal reportado en los campos planos de abajo (`OBJETIVO_PERSISTIDO`). */
  @Column('text', { default: 'parada_imprevista' })
  objetivo!: ObjetivoModelo;

  @Column('text')
  iniciadoEn!: string;

  @Column('text', { nullable: true })
  finalizadoEn!: string | null;

  @Column('integer', { nullable: true })
  duracionMs!: number | null;

  /** Muestras `anticipado` del snapshot reconstruido para esta corrida. */
  @Column('integer', { default: 0 })
  muestras!: number;

  /** Decisión y motivo de `objetivo` (el resumen que ve la UI en `ReentrenamientoJob.mensaje`). */
  @Column('text', { nullable: true })
  decision!: DecisionPromocion | null;

  @Column('text', { nullable: true })
  motivo!: string | null;

  /** Detalle de los 4 objetivos, aunque sólo `objetivo` tenga fila propia en `modelo_version`. */
  @Column('simple-json', { nullable: true })
  resultados!: ResultadoObjetivoEjecucion[] | null;

  /** Mensaje de fallo si `estado` es `error` u `omitido`. */
  @Column('text', { nullable: true })
  error!: string | null;
}
