import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { TipoMermaCodigo } from '@mes/types';

@Entity('merma')
export class Merma {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  ordenId!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  @Column('text')
  tipo!: TipoMermaCodigo;

  @Column('real', { default: 0 })
  cantidadKg!: number;

  @Column('text')
  sabor!: string;

  @Column('text')
  causaId!: string;

  @Column('text')
  responsableId!: string;

  @Column('text', { nullable: true })
  codigoBalde?: string | null;

  @Column('boolean', { default: false })
  enviarPasteurizacion!: boolean;

  @Column('text')
  registradaEn!: string;

  @Column('integer', { default: 0 })
  tiempoRegistroSeg!: number;

  @Column('text', { nullable: true })
  observacion?: string | null;
}
