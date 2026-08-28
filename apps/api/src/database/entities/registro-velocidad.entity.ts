import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

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

  @Column('real')
  velocidadReal!: number;

  @Column('real')
  velocidadEstandar!: number;

  /** Porcentaje con signo: `-1,7` = 1,7 % por debajo del estándar. */
  @Column('real', { default: 0 })
  desvioPct!: number;

  @Column('text', { nullable: true })
  motivo?: string | null;

  @Column('text')
  responsableId!: string;

  @Column('integer', { default: 0 })
  tiempoRegistroSeg!: number;
}
