import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { CategoriaParada } from './parada-agregada.entity';

/** Segmentos del donut Rutinarias / Imprevistas / Fallas (spec 06.B). */
@Entity('parada_categoria')
export class ParadaCategoria {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  clave!: CategoriaParada;

  @Column('text')
  label!: string;

  @Column('integer', { default: 0 })
  minutos!: number;

  @Column('integer', { default: 0 })
  orden!: number;
}
