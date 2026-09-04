import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Linea } from './linea.entity';

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

  @Column('double precision', { default: 0 })
  mp!: number;

  @Column('double precision', { default: 0 })
  ep!: number;

  @Column('double precision', { default: 0 })
  pt!: number;

  @Column('integer', { default: 0 })
  orden!: number;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;
}
