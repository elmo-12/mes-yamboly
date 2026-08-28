import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

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

  @Column('real', { default: 0 })
  probabilidad!: number;

  @Column('text')
  eventoReal!: string;

  @Column('boolean', { nullable: true })
  acierto!: boolean | null;

  /** Versión del modelo que la generó. */
  @Column('text', { default: 'v3.2' })
  modeloVersion!: string;
}
