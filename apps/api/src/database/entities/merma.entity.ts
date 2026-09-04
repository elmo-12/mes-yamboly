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

  /** Raíz del árbol de causas de merma (`nivel: 'tipo'`), p. ej. `CME-MP-01`. */
  @Column('text', { default: '' })
  tipoCausaId!: string;

  /** Nivel intermedio (`nivel: 'clasificacion'`); `null` si la causa cuelga del tipo. */
  @Column('text', { nullable: true })
  clasificacionId!: string | null;

  /** Hoja seleccionada (`nivel: 'causa'`), p. ej. `CME-MP-01-01`. */
  @Column('text')
  causaId!: string;

  /** N.º de solicitud exigido por causas con `requiereSolicitud`. */
  @Column('text', { nullable: true })
  numeroSolicitud!: string | null;

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
