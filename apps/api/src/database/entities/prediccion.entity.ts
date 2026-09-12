import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { Turno as TurnoCodigo } from '@mes/types';

/** Cómo se produjo la predicción: ciclo de inferencia en vivo o backtest. */
export type OrigenPrediccion = 'vivo' | 'backtest';

/** Predicción histórica contrastada con el evento real (spec 08.C). */
@Entity('prediccion')
export class Prediccion {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  fecha!: string;

  @Column('text')
  lineaCodigo!: string;

  @Column('text')
  tipo!: string;

  @Column('text')
  prediccion!: string;

  @Column('double precision', { default: 0 })
  probabilidad!: number;

  @Column('text')
  eventoReal!: string;

  @Column('boolean', { nullable: true })
  acierto!: boolean | null;

  /** Versión del modelo que la generó. */
  @Column('text', { default: 'v1.0' })
  modeloVersion!: string;

  /* --- Trazabilidad del ciclo de inferencia (plan de IA §6.4 y §7.3) --- */

  @Index()
  @Column('text', { nullable: true })
  lineaId!: string | null;

  /** Turno para el que se predijo (no el turno en que se calculó). */
  @Column('text', { nullable: true })
  turnoObjetivo!: TurnoCodigo | null;

  @Column('text', { nullable: true })
  ventanaInicio!: string | null;

  @Column('text', { nullable: true })
  ventanaFin!: string | null;

  /** Vector de features con el que se puntuó, para poder reproducir el cálculo. */
  @Column('simple-json', { nullable: true })
  features!: Record<string, number> | null;

  /** Alerta que generó esta predicción, si superó `umbrales.probabilidadMinima`. */
  @Column('text', { nullable: true })
  alertaId!: string | null;

  @Index()
  @Column('text', { default: 'backtest' })
  origen!: OrigenPrediccion;
}
