import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { Turno as TurnoCodigo } from '@mes/types';

@Entity('turno')
export class Turno {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  codigo!: TurnoCodigo;

  @Column('text')
  label!: string;

  @Column('text')
  inicio!: string;

  @Column('text')
  fin!: string;

  @Column('boolean', { default: true })
  activo!: boolean;
}
