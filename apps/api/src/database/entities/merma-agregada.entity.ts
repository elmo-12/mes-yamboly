import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Merma acumulada por línea y tipo (barras apiladas de spec 06.C). */
@Entity('merma_agregada')
export class MermaAgregada {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  lineaId!: string;

  @Column('text')
  lineaCodigo!: string;

  @Column('text')
  lineaNombre!: string;

  @Column('real', { default: 0 })
  mp!: number;

  @Column('real', { default: 0 })
  ep!: number;

  @Column('real', { default: 0 })
  pt!: number;

  @Column('integer', { default: 0 })
  orden!: number;
}
