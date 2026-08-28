import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Hecho de OEE por línea (spec 06.A). Guarda las magnitudes crudas del
 * periodo para que `computeOee()` derive disponibilidad, desempeño,
 * calidad y OEE — no se almacenan porcentajes precalculados.
 */
@Entity('indicador_linea')
export class IndicadorLinea {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  lineaId!: string;

  @Column('text')
  lineaCodigo!: string;

  @Column('text')
  lineaNombre!: string;

  @Column('integer', { default: 0 })
  tiempoPlanificadoMin!: number;

  @Column('integer', { default: 0 })
  paradasMin!: number;

  @Column('integer', { default: 0 })
  unidadesProducidas!: number;

  @Column('integer', { default: 0 })
  unidadesBuenas!: number;

  @Column('integer', { default: 0 })
  velocidadEstandar!: number;

  @Column('integer', { default: 0 })
  orden!: number;
}
