import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { EstadoAlerta, FactorAlerta, SeveridadAlerta, TipoAlerta } from '@mes/types';

/** Alerta predictiva del motor de reglas / modelo IA (spec 07). */
@Entity('alerta')
export class Alerta {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  tipo!: TipoAlerta;

  @Index()
  @Column('text')
  severidad!: SeveridadAlerta;

  @Index()
  @Column('text')
  lineaId!: string;

  @Column('text')
  lineaCodigo!: string;

  @Column('text')
  lineaNombre!: string;

  @Column('text')
  prediccion!: string;

  /** Probabilidad 0–100 devuelta por el `PredictionProvider`. */
  @Column('real', { default: 0 })
  probabilidad!: number;

  @Column('text')
  ventanaInicio!: string;

  @Column('text')
  ventanaFin!: string;

  @Index()
  @Column('text', { default: 'activa' })
  estado!: EstadoAlerta;

  /** `null` mientras no se confirma el evento real — alimenta el KPI EP. */
  @Column('boolean', { nullable: true })
  acierto!: boolean | null;

  @Column('simple-json', { default: '[]' })
  factores!: FactorAlerta[];

  @Column('text', { nullable: true })
  accionTomada?: string | null;

  @Column('text', { nullable: true })
  observacion?: string | null;

  @Column('text')
  generadaEn!: string;

  @Column('text', { nullable: true })
  atendidaPor?: string | null;

  @Column('text', { nullable: true })
  atendidaEn?: string | null;
}
