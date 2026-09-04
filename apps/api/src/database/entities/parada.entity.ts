import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { OrigenParada } from '@mes/types';
import { CausaParada } from './causa-parada.entity';
import { DeteccionIoT } from './deteccion-iot.entity';
import { Linea } from './linea.entity';
import { OrdenFabricacion } from './orden-fabricacion.entity';
import { User } from './user.entity';

@Entity('parada')
export class Parada {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  ordenId!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  /** Causa específica (`PM-01-03`). */
  @Column('text')
  causaId!: string;

  /** Causa raíz / tipo (`PM-01`). */
  @Column('text')
  tipoCausaId!: string;

  @Column('text')
  inicio!: string;

  @Column('text', { nullable: true })
  fin!: string | null;

  @Column('integer', { default: 0 })
  duracionMin!: number;

  @Column('text')
  accionTomada!: string;

  @Column('text', { nullable: true })
  numeroSolicitud?: string | null;

  @Column('text', { nullable: true })
  evidenciaUrl?: string | null;

  @Column('boolean', { default: true })
  afectaOee!: boolean;

  @Column('text')
  responsableId!: string;

  @Column('text', { default: 'manual' })
  origen!: OrigenParada;

  @Column('text', { nullable: true })
  deteccionId?: string | null;

  /** Segundos que tardó el registro en la app — alimenta el KPI TRI. */
  @Column('integer', { default: 0 })
  tiempoRegistroSeg!: number;

  @Column('text', { nullable: true })
  comentarioCierre?: string | null;

  /** FK real sobre `ordenId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => OrdenFabricacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ordenId' })
  orden?: OrdenFabricacion | null;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;

  /** FK real sobre `causaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaParada, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'causaId' })
  causa?: CausaParada | null;

  /** FK real sobre `tipoCausaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaParada, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipoCausaId' })
  tipoCausa?: CausaParada | null;

  /** FK real sobre `responsableId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'responsableId' })
  responsable?: User | null;

  /** FK real sobre `deteccionId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => DeteccionIoT, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'deteccionId' })
  deteccion?: DeteccionIoT | null;
}
