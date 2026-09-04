import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo, TipoProcesoLinea } from '@mes/types';

/** Línea de producción = máquina física del maestro real (9 líneas). */
@Entity('linea')
export class Linea {
  @PrimaryColumn('text')
  id!: string;

  /** `LLEN-M2`, `EXTR-2`, `MOLD-A3`. */
  @Column('text')
  codigo!: string;

  /** `Llenadora M2`, `Extrusora 2`, `Moldeadora A3`. */
  @Column('text')
  nombre!: string;

  /** Etiqueta compacta para LineCard y modo TV: `LLEN M2`. */
  @Column('text', { default: '' })
  nombreCorto!: string;

  @Column('text', { default: 'llenadora' })
  tipoProceso!: TipoProcesoLinea;

  /**
   * Columna interna heredada: la aplicación opera una **única sede** (Lima).
   * No se expone en la API pública ni se filtra por ella; el valor es siempre
   * `SEDE_UNICA_ID`.
   */
  @Column('text', { default: 'SED-LIMA' })
  sedeId!: string;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;

  /** Máximo `velocidadUnidMin` de sus pares producto × línea activos. */
  @Column('real', { default: 0 })
  capacidadUnidadesMin!: number;
}
