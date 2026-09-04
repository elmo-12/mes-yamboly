import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo } from '@mes/types';
import { Linea } from './linea.entity';
import { Producto } from './producto.entity';

/**
 * Velocidad estándar del par producto × línea (tabla `producto_linea` del
 * maestro real, 340 pares). `velocidadUnidHora` es el dato fuente y
 * `velocidadUnidMin = velocidadUnidHora / 60` (1 decimal) es la magnitud que
 * consume el OEE y que se congela en `OrdenFabricacion.velocidadEstandar`.
 */
@Entity('producto_linea')
@Index(['productoId', 'lineaId'], { unique: true })
export class VelocidadEstandar {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  productoId!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  /** Dato fuente del maestro, en unidades por **hora** (360–29 000). */
  @Column('integer')
  velocidadUnidHora!: number;

  /** Derivado: `velocidadUnidHora / 60` con 1 decimal. Lo consume el OEE. */
  @Column('double precision')
  velocidadUnidMin!: number;

  /** Merma estándar admitida para el par, en porcentaje (0–100). */
  @Column('double precision', { default: 0 })
  mermaEstandarPct!: number;

  /** Minutos de CIP del par; `null` si el maestro no lo define. */
  @Column('double precision', { nullable: true })
  cipMin!: number | null;

  /** Minutos de arranque del par; `null` si el maestro no lo define. */
  @Column('double precision', { nullable: true })
  arranqueMin!: number | null;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;

  /** FK real sobre `productoId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Producto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productoId' })
  producto?: Producto | null;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;
}
