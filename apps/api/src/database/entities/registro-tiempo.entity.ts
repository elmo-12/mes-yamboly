import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { EtapaMedicion } from '@mes/types';
import { User } from './user.entity';

/**
 * Anexo 02 — Ficha de registro del tiempo de registro de información (TRI).
 * El postest se alimenta solo: cada parada, merma, velocidad u orden emite
 * `evidence.tri.registro` con los segundos que tardó el formulario.
 */
@Entity('registro_tiempo')
export class RegistroTiempo {
  @PrimaryColumn('text')
  id!: string;

  @Column('integer', { default: 0 })
  n!: number;

  @Index()
  @Column('text')
  fecha!: string;

  /** `Parada PM-01-03 · L2 Conos` */
  @Column('text')
  eventoRegistrado!: string;

  /** `HH:mm:ss` */
  @Column('text')
  horaInicioRegistro!: string;

  /** Segundos cronometrados; `tiempoMin` se deriva de aquí. */
  @Column('integer', { default: 0 })
  segundos!: number;

  @Index()
  @Column('text', { default: 'postest' })
  etapa!: EtapaMedicion;

  /** `parada` · `merma` · `velocidad` · `orden` · `manual`. */
  @Column('text', { default: 'manual' })
  tipo!: string;

  @Column('text', { nullable: true })
  usuarioId?: string | null;

  @Column('text', { nullable: true })
  observacion?: string | null;

  /** FK real sobre `usuarioId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'usuarioId' })
  usuario?: User | null;
}
