import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { TipoAuditoria } from '@mes/types';

/** Bitácora RF12: toda mutación de negocio deja una fila aquí. */
@Entity('audit_event')
export class AuditEvent {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  ordenId!: string;

  @Column('text')
  fecha!: string;

  @Column('text')
  usuario!: string;

  @Column('text')
  usuarioIniciales!: string;

  @Column('text')
  tipo!: TipoAuditoria;

  @Column('text')
  texto!: string;
}
