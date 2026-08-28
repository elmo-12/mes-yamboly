import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Token de un solo uso de la encuesta de satisfacción (Anexo 04).
 * Se reparte uno por invitado: `tsp-2026-01` … `tsp-2026-22`.
 */
@Entity('encuesta_sesion')
export class EncuestaSesion {
  @PrimaryColumn('text')
  token!: string;

  @Column('text')
  invitado!: string;

  @Column('text', { nullable: true })
  rol?: string | null;

  @Column('boolean', { default: false })
  respondida!: boolean;

  @Column('text', { nullable: true })
  respondidaEn?: string | null;
}
