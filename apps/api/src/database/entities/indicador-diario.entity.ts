import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Hecho diario de reportes/analítica (spec 06.A / 08.C).
 * Una fila por día: alimenta la tendencia de OEE y la serie
 * «predicho vs real» de predicciones de los últimos 30 días.
 */
@Entity('indicador_diario')
export class IndicadorDiario {
  @PrimaryColumn('text')
  id!: string;

  /** `YYYY-MM-DD` */
  @Index()
  @Column('text')
  fecha!: string;

  @Column('double precision', { default: 0 })
  oee!: number;

  @Column('double precision', { default: 85 })
  meta!: number;

  /** Alertas que el modelo predijo ese día. */
  @Column('integer', { default: 0 })
  prediccionesPredichas!: number;

  /** Eventos reales observados ese día. */
  @Column('integer', { default: 0 })
  prediccionesReales!: number;
}
