import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Linea } from './linea.entity';
import { OrdenFabricacion } from './orden-fabricacion.entity';
import { User } from './user.entity';

@Entity('registro_velocidad')
export class RegistroVelocidad {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  ordenId!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  @Column('text')
  registradaEn!: string;

  @Column('double precision')
  velocidadReal!: number;

  @Column('double precision')
  velocidadEstandar!: number;

  /** Porcentaje con signo: `-1,7` = 1,7 % por debajo del estándar. */
  @Column('double precision', { default: 0 })
  desvioPct!: number;

  @Column('text', { nullable: true })
  motivo?: string | null;

  @Column('text')
  responsableId!: string;

  @Column('integer', { default: 0 })
  tiempoRegistroSeg!: number;

  /** FK real sobre `ordenId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => OrdenFabricacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ordenId' })
  orden?: OrdenFabricacion | null;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;

  /** FK real sobre `responsableId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsableId' })
  responsable?: User | null;
}
