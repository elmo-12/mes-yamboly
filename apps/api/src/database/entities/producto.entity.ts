import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo } from '@mes/types';

@Entity('producto')
export class Producto {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('text')
  sabor!: string;

  @Column('text')
  presentacion!: string;

  @Column('text')
  lineaId!: string;

  @Column('integer')
  velocidadEstandar!: number;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;
}
