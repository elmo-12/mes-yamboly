import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { Turno } from '@mes/types';

/** Comparativa de OEE por turno del periodo (spec 06.A). */
@Entity('indicador_turno')
export class IndicadorTurno {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  turno!: Turno;

  @Column('text')
  turnoLabel!: string;

  @Column('real', { default: 0 })
  oee!: number;

  @Column('real', { default: 0 })
  disponibilidad!: number;

  @Column('real', { default: 0 })
  desempeno!: number;

  @Column('real', { default: 0 })
  calidad!: number;

  /** Δ en puntos porcentuales frente al periodo comparado. */
  @Column('real', { default: 0 })
  deltaOee!: number;

  @Column('integer', { default: 0 })
  orden!: number;
}
