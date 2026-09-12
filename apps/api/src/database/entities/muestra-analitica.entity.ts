import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Turno as TurnoCodigo } from '@mes/types';
import { Linea } from './linea.entity';

/**
 * Modo de la muestra (§4.2 del plan de IA · regla anti-fuga).
 *
 * - `retro`: incluye además las features del propio turno (OEE, velocidad real,
 *   producido). Sólo sirve para medir el techo del modelo en retrospectiva.
 * - `anticipado`: sólo lo conocido **antes** de que arranque el turno objetivo.
 *   Es el único modo que se despliega: el que alimenta la inferencia y el
 *   backtest, para que las métricas publicadas sean alcanzables en producción.
 */
export type ModoMuestra = 'retro' | 'anticipado';

/**
 * Fila del *feature store* de analítica: una por `línea × fecha × turno × modo`.
 * Se reconstruye entera en cada reentrenamiento (son cientos de filas: rehacerla
 * es más barato y mucho menos frágil que mantenerla incrementalmente).
 */
@Entity('muestra_analitica')
@Index(['lineaId', 'fecha', 'turno', 'modo'], { unique: true })
export class MuestraAnalitica {
  /** `MUE-<lineaCodigo>-<fecha>-<turno>-<modo>`. */
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  @Column('text')
  lineaCodigo!: string;

  /** Fecha operativa `YYYY-MM-DD` del turno (la del arranque, también para Noche). */
  @Index()
  @Column('text')
  fecha!: string;

  @Column('text')
  turno!: TurnoCodigo;

  @Column('text')
  modo!: ModoMuestra;

  /** Marca de inicio del turno objetivo: corte estricto de las features históricas. */
  @Column('text')
  inicioTurno!: string;

  /** Vector de features nombradas; el orden lo fija `features.ts`, no este JSON. */
  @Column('simple-json', { default: '{}' })
  features!: Record<string, number>;

  /** Target primario: 1 si el turno tuvo parada imprevista relevante. */
  @Column('integer', { default: 0 })
  huboParadaImprevista!: number;

  /** Target secundario: 1 si la merma del turno superó el estándar del par. */
  @Column('integer', { default: 0 })
  mermaSobreEstandar!: number;

  /** Minutos de parada imprevista con `afectaOee` acumulados en el turno. */
  @Column('double precision', { default: 0 })
  minutosImprevistos!: number;

  /** Causa raíz que más minutos aportó al turno; `null` si no hubo paradas. */
  @Column('text', { nullable: true })
  tipoCausaDominante!: string | null;

  /** Nº de órdenes del turno del que se derivó la muestra. */
  @Column('integer', { default: 0 })
  ordenes!: number;

  @Column('text')
  construidaEn!: string;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;
}
