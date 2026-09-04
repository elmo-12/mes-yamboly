import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * Token de un solo uso de la encuesta de satisfacción (Anexo 04).
 * Se reparte uno por invitado: `tsp-2026-01` … `tsp-2026-22`.
 */
@Entity('encuesta_sesion')
export class EncuestaSesion {
  @PrimaryColumn('text')
  token!: string;

  /** Id del usuario invitado (`usuario.id`); nullable por compatibilidad con datos previos. */
  @Column('text', { nullable: true })
  usuarioId?: string | null;

  /** Nombre del invitado, copiado del usuario al crear la invitación. */
  @Column('text')
  invitado!: string;

  @Column('text', { nullable: true })
  rol?: string | null;

  @Column('boolean', { default: false })
  respondida!: boolean;

  @Column('text', { nullable: true })
  respondidaEn?: string | null;

  /** ISO-8601 en que el investigador emitió la invitación. */
  @Column('text', { default: '' })
  creadaEn!: string;

  /** FK real sobre `usuarioId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'usuarioId' })
  usuario?: User | null;
}
