import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo } from '@mes/types';

/**
 * Catálogo de sabores del maestro real (41 registros, sin FK con producto:
 * `Producto.saborId` se resuelve por heurística y `Producto.sabor` es texto).
 */
@Entity('sabor')
export class Sabor {
  @PrimaryColumn('text')
  id!: string;

  /** Código de 7 dígitos del maestro original: `2110124`. */
  @Column('text', { unique: true })
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;
}
