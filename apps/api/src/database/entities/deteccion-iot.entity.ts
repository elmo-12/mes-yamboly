import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { EstadoDeteccion } from '@mes/types';
import { Linea } from './linea.entity';
import { Parada } from './parada.entity';

@Entity('deteccion_iot')
export class DeteccionIoT {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  @Column('text')
  lineaCodigo!: string;

  @Column('text')
  detectadaEn!: string;

  @Column('integer', { default: 0 })
  minutos!: number;

  @Column('text', { default: 'sugerida' })
  estado!: EstadoDeteccion;

  @Column('text', { nullable: true })
  paradaId?: string | null;

  @Column('text')
  texto!: string;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;

  /** FK real sobre `paradaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Parada, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'paradaId' })
  parada?: Parada | null;
}
