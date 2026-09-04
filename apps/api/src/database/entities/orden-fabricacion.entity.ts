import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Colaborador, EstadoOrden, OeeDetalle, Turno as TurnoCodigo } from '@mes/types';
import { Linea } from './linea.entity';
import { Producto } from './producto.entity';
import { User } from './user.entity';
import { VelocidadEstandar } from './velocidad-estandar.entity';

@Entity('orden_fabricacion')
export class OrdenFabricacion {
  @PrimaryColumn('text')
  id!: string;

  @Index({ unique: true })
  @Column('text')
  codigo!: string;

  /** `YYYY-MM-DD` */
  @Column('text')
  fecha!: string;

  @Column('text')
  lineaId!: string;

  @Column('text')
  productoId!: string;

  @Column('text')
  turno!: TurnoCodigo;

  @Column('text')
  lote!: string;

  @Column('text')
  vencimiento!: string;

  @Column('integer', { default: 0 })
  planificado!: number;

  @Column('integer', { default: 0 })
  producido!: number;

  @Column('integer', { default: 0 })
  conteoCodificadora!: number;

  /**
   * Velocidad estándar en **unidades por minuto**, congelada al iniciar la orden
   * desde el par producto × línea vigente (`VelocidadEstandar.velocidadUnidMin`).
   */
  @Column('double precision', { default: 0 })
  velocidadEstandar!: number;

  /** Par producto × línea del que se copió `velocidadEstandar` (`VE-0002`). */
  @Column('text', { nullable: true })
  velocidadEstandarId!: string | null;

  @Column('text', { default: 'en_curso' })
  estado!: EstadoOrden;

  @Column('text')
  maquinistaId!: string;

  @Column('text')
  supervisorId!: string;

  @Column('integer', { default: 0 })
  operarios!: number;

  @Column('simple-json', { default: '[]' })
  colaboradores!: Colaborador[];

  @Column('simple-json')
  oee!: OeeDetalle;

  @Column('integer', { default: 0 })
  paradasCount!: number;

  @Column('double precision', { default: 0 })
  mermasKg!: number;

  @Column('text')
  inicio!: string;

  @Column('text', { nullable: true })
  fin!: string | null;

  @Column('text', { nullable: true })
  observacion?: string | null;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;

  /** FK real sobre `productoId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Producto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productoId' })
  producto?: Producto | null;

  /** FK real sobre `velocidadEstandarId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => VelocidadEstandar, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'velocidadEstandarId' })
  parProductoLinea?: VelocidadEstandar | null;

  /** FK real sobre `maquinistaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'maquinistaId' })
  maquinista?: User | null;

  /** FK real sobre `supervisorId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supervisorId' })
  supervisor?: User | null;
}
