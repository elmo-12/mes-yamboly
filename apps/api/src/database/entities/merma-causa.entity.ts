import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { TipoMermaCodigo } from '@mes/types';
import { CausaMerma } from './causa-merma.entity';

/**
 * Merma por causa y turno (spec 06.C). `kgPorTurno` = [Mañana, Tarde, Noche]
 * alimenta el heatmap causa × turno y su suma la tabla de detalle.
 */
@Entity('merma_causa')
export class MermaCausa {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  causaId!: string;

  @Column('text')
  causaCodigo!: string;

  @Column('text')
  causaNombre!: string;

  @Column('text')
  tipoPredominante!: TipoMermaCodigo;

  @Column('text')
  lineaMasAfectada!: string;

  @Column('simple-json', { default: '[]' })
  kgPorTurno!: number[];

  @Column('integer', { default: 0 })
  orden!: number;

  /** FK real sobre `causaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaMerma, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'causaId' })
  causa?: CausaMerma | null;
}
