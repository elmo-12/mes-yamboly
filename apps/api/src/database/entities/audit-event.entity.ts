import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { TipoAuditoria } from '@mes/types';
import { OrdenFabricacion } from './orden-fabricacion.entity';

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

  /** FK real sobre `ordenId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => OrdenFabricacion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ordenId' })
  orden?: OrdenFabricacion | null;
}
