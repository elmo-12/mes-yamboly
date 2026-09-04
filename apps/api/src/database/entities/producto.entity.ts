import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo } from '@mes/types';

/**
 * Producto terminado del maestro real (código de 7 dígitos).
 * No lleva `lineaId` ni `velocidadEstandar`: la velocidad vive en el par
 * producto × línea (`VelocidadEstandar`, tabla `producto_linea`).
 */
@Entity('producto')
export class Producto {
  @PrimaryColumn('text')
  id!: string;

  /** 7 dígitos: `1110001`. */
  @Column('text', { unique: true })
  codigo!: string;

  /** Nombre mostrado en la UI (= `descripcionCorta`). */
  @Column('text')
  nombre!: string;

  @Column('text', { default: '' })
  descripcionLarga!: string;

  @Column('text', { default: '' })
  descripcionCorta!: string;

  /** Alias interno de planta; `null` en la mayoría de productos. */
  @Column('text', { nullable: true })
  alias!: string | null;

  @Column('text', { nullable: true })
  marca!: string | null;

  /** Presentación comercial: `2.54 kg(5L)`, `120 ml`, … */
  @Column('text', { nullable: true })
  presentacion!: string | null;

  @Column('integer', { default: 1 })
  unidadesPorCaja!: number;

  /** Peso neto por unidad en kilogramos. */
  @Column('real', { default: 0 })
  pesoKg!: number;

  /** Id de `Sabor`; `null` cuando la heurística del maestro no lo resolvió. */
  @Column('text', { nullable: true })
  saborId!: string | null;

  /** Nombre del sabor (informativo, derivado del maestro): `Capuccino`. */
  @Column('text', { default: '' })
  sabor!: string;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;
}
