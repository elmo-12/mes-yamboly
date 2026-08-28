import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

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
}
