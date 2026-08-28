import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { TipoMermaCodigo } from '@mes/types';

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
}
