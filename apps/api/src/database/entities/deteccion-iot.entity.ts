import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { EstadoDeteccion } from '@mes/types';

@Entity('deteccion_iot')
export class DeteccionIoT {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  @Column('text')
  lineaCodigo!: string;

  @Column('text', { nullable: true })
  maquinaId?: string | null;

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
}
