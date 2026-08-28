import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type AmbitoKpi = 'indicadores' | 'paradas' | 'mermas';

/**
 * KPI de cabecera de cada pestaña de Reportes (spec 06.A/B/C).
 * Las cifras del periodo se persisten y el servicio deriva el delta
 * comparado (`periodo_anterior` / `anio_anterior`).
 */
@Entity('indicador_kpi')
export class IndicadorKpi {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  ambito!: AmbitoKpi;

  @Column('text')
  clave!: string;

  @Column('text')
  label!: string;

  @Column('real', { default: 0 })
  valor!: number;

  @Column('text', { default: '' })
  unidad!: string;

  @Column('real', { nullable: true })
  meta!: number | null;

  @Column('real', { nullable: true })
  deltaValor!: number | null;

  @Column('text', { nullable: true })
  deltaUnidad!: string | null;

  @Column('boolean', { default: true })
  deltaFavorableSiSube!: boolean;

  /** Delta frente al mismo periodo del año anterior. */
  @Column('real', { nullable: true })
  deltaAnioValor!: number | null;

  @Column('integer', { default: 0 })
  orden!: number;
}
