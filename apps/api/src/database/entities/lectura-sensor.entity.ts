import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { EstadoLecturaSensor } from '@mes/types';
import { ImportacionFuente } from './importacion-fuente.entity';
import { Linea } from './linea.entity';

/**
 * Lectura puntual del sensor de una línea (`plantilla-sensores.xlsx`).
 * El motor de validación TCI construye tramos PARADA/PRODUCIENDO ordenando las
 * lecturas de una línea por fecha: cada tramo va **desde una lectura hasta la
 * siguiente**.
 */
@Entity('lectura_sensor')
@Index(['lineaId', 'fechaHora'])
export class LecturaSensor {
  /** `SEN-<importacion>-<n>`. */
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  importacionId!: string;

  @Column('text')
  lineaId!: string;

  /** ISO-8601 local `YYYY-MM-DDTHH:mm:ss`. */
  @Column('text')
  fechaHora!: string;

  @Column('text')
  estado!: EstadoLecturaSensor;

  /** Velocidad instantánea informada por el sensor; `null` si no viene. */
  @Column('double precision', { nullable: true })
  velocidadUnidMin!: number | null;

  /** FK real sobre `importacionId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => ImportacionFuente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'importacionId' })
  importacion?: ImportacionFuente | null;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;
}
