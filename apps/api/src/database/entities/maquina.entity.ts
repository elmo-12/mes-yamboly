import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoMaquina } from '@mes/types';

@Entity('maquina')
export class Maquina {
  @PrimaryColumn('text')
  id!: string;

  @Column('text', { unique: true })
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('text')
  tipo!: string;

  @Column('text')
  lineaId!: string;

  @Column('text', { default: 'operativa' })
  estado!: EstadoMaquina;

  @Column('integer', { default: 0 })
  paradas30d!: number;
}
