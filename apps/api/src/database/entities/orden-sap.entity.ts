import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Turno as TurnoCodigo } from '@mes/types';
import { Linea } from './linea.entity';
import { OrdenFabricacion } from './orden-fabricacion.entity';
import { Producto } from './producto.entity';

/**
 * Orden SAP planificada, copia local de `orden_fabricacion_dbs` del sistema
 * legado (la inserta allí el integrador de SAP). El wizard «Iniciar orden» del
 * MES elige una fila **pendiente** (`ordenId` nulo) y la orden de fabricación
 * nace de ella; al crearla se escribe `ordenId` en la misma transacción.
 *
 * El número SAP no es único (se repite entre fechas, turnos, líneas y
 * parciales): lo que se consume una sola vez es la fila, por eso el id deriva
 * del id de la fila de origen (`SAP-<id>`) y no del número.
 */
@Entity('orden_sap')
@Index(['lineaId', 'fecha'])
export class OrdenSap {
  /** `SAP-<id de orden_fabricacion_dbs>`; `SAPD-…` en los datos de demostración. */
  @PrimaryColumn('text')
  id!: string;

  /** Número de OF en SAP (`95101752`). No es único. */
  @Index()
  @Column('text')
  numero!: string;

  /** `YYYY-MM-DD` del plan SAP. */
  @Column('text')
  fecha!: string;

  @Column('text')
  turno!: TurnoCodigo;

  @Column('text')
  lineaId!: string;

  /** `null` si el código SAP no existe en el maestro del MES: no se lista. */
  @Column('text', { nullable: true })
  productoId!: string | null;

  @Column('text', { default: '' })
  codigoProducto!: string;

  /** Descripción del producto tal como llega de SAP. */
  @Column('text', { default: '' })
  productoNombre!: string;

  /** Cantidad planificada en **cajas**. */
  @Column('integer', { default: 0 })
  planificadoCajas!: number;

  /** Velocidad del texto SAP (`'22800 u/h'`) en u/h; `null` si viene vacía o en 0. */
  @Column('integer', { nullable: true })
  velocidadUnidHora!: number | null;

  @Column('text', { nullable: true })
  tipoProduccion!: string | null;

  /** Orden de fabricación que consumió la fila; `null` mientras está pendiente. */
  @Index()
  @Column('text', { nullable: true })
  ordenId!: string | null;

  /** ISO local de la última sincronización que trajo o refrescó la fila. */
  @Column('text')
  sincronizadaEn!: string;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;

  /** FK real sobre `productoId` — no se carga. */
  @ManyToOne(() => Producto, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productoId' })
  producto?: Producto | null;

  /**
   * FK real sobre `ordenId`. `SET NULL`: si la orden se borra (p. ej. la
   * recarga completa de `pnpm sync:real`), la fila vuelve a quedar pendiente.
   */
  @ManyToOne(() => OrdenFabricacion, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'ordenId' })
  orden?: OrdenFabricacion | null;
}
