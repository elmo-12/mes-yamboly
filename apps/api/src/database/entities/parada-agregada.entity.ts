import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { CausaParada } from './causa-parada.entity';

/** Rutinarias · Imprevistas · Fallas (donut de spec 06.B). */
export type CategoriaParada = 'rutinarias' | 'imprevistas' | 'fallas';

/**
 * Agregado de paradas por causa raíz del periodo (spec 06.B y 08.B).
 * `minutosPorTurno` es el vector [Mañana, Tarde, Noche] que alimenta el
 * heatmap causa × turno de Analítica.
 */
@Entity('parada_agregada')
export class ParadaAgregada {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  causaId!: string;

  @Column('text')
  causaCodigo!: string;

  @Column('text')
  causaNombre!: string;

  @Column('text')
  categoria!: CategoriaParada;

  @Column('integer', { default: 0 })
  cantidad!: number;

  @Column('integer', { default: 0 })
  minutos!: number;

  @Column('text')
  lineaMasAfectada!: string;

  /** Serie corta del sparkline (7 puntos). */
  @Column('simple-json', { default: '[]' })
  tendencia!: number[];

  /** Minutos por turno `[M, T, N]` — heatmap de Analítica. */
  @Column('simple-json', { default: '[]' })
  minutosPorTurno!: number[];

  @Column('integer', { default: 0 })
  orden!: number;

  /** FK real sobre `causaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaParada, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'causaId' })
  causa?: CausaParada | null;
}
