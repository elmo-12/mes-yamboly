import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { TipoMermaCodigo } from '@mes/types';
import { CausaMerma } from './causa-merma.entity';
import { Linea } from './linea.entity';
import { OrdenFabricacion } from './orden-fabricacion.entity';
import { User } from './user.entity';

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

  @Column('double precision', { default: 0 })
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

  /** FK real sobre `ordenId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => OrdenFabricacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ordenId' })
  orden?: OrdenFabricacion | null;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;

  /** FK real sobre `tipoCausaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaMerma, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipoCausaId' })
  tipoCausa?: CausaMerma | null;

  /** FK real sobre `clasificacionId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaMerma, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'clasificacionId' })
  clasificacion?: CausaMerma | null;

  /** FK real sobre `causaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaMerma, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'causaId' })
  causa?: CausaMerma | null;

  /** FK real sobre `responsableId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsableId' })
  responsable?: User | null;
}
