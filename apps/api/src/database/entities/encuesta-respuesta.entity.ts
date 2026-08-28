import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Anexo 04 — respuestas Likert 1–5 a los 8 ítems de la encuesta (TSP). */
@Entity('encuesta_respuesta')
export class EncuestaRespuesta {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  token!: string;

  /** 8 enteros 1–5, en el orden de los ítems. */
  @Column('simple-json', { default: '[]' })
  respuestas!: number[];

  @Column('text', { nullable: true })
  comentario?: string | null;

  @Column('text')
  fecha!: string;
}
