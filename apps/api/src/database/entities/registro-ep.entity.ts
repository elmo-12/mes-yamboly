import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Alerta } from './alerta.entity';

/**
 * Anexo 06 — registro de exactitud de las predicciones (EP).
 * Cada fila es una predicción cuyo evento real ya fue confirmado; se crea
 * automáticamente al confirmar una alerta. EP = aciertos / filas × 100.
 */
@Entity('registro_ep')
export class RegistroEp {
  @PrimaryColumn('text')
  id!: string;

  @Column('integer', { default: 0 })
  n!: number;

  @Index()
  @Column('text')
  fecha!: string;

  /** `Parada prevista · L2 Conos` */
  @Column('text')
  tipoPrediccion!: string;

  @Column('text')
  eventoReal!: string;

  @Column('boolean', { default: false })
  acierto!: boolean;

  @Column('text', { default: '' })
  observacion!: string;

  @Column('text', { nullable: true })
  alertaId?: string | null;

  /** FK real sobre `alertaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Alerta, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'alertaId' })
  alerta?: Alerta | null;
}
