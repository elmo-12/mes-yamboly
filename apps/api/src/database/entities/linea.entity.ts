import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo } from '@mes/types';

@Entity('linea')
export class Linea {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('text')
  sedeId!: string;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;

  @Column('integer')
  capacidadUnidadesMin!: number;
}
