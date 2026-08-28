import { Column, Entity, PrimaryColumn } from 'typeorm';

export type EstadoModelo = 'vigente' | 'archivada' | 'entrenando';

/** Versión del modelo predictivo y sus métricas de evaluación (spec 08.D). */
@Entity('modelo_version')
export class ModeloVersion {
  @PrimaryColumn('text')
  version!: string;

  @Column('text')
  entrenadoEn!: string;

  @Column('integer', { default: 0 })
  eventos!: number;

  @Column('real', { default: 0 })
  auc!: number;

  @Column('real', { default: 0 })
  f1!: number;

  @Column('real', { default: 0 })
  precision!: number;

  @Column('real', { default: 0 })
  recall!: number;

  @Column('integer', { default: 0 })
  features!: number;

  /** Alertas emitidas por esta versión en los últimos 30 días. */
  @Column('integer', { default: 0 })
  alertas30d!: number;

  @Column('text', { default: 'Gradient Boosting (scikit-learn)' })
  algoritmo!: string;

  @Column('text', { default: 'archivada' })
  estado!: EstadoModelo;

  @Column('integer', { default: 0 })
  orden!: number;
}
