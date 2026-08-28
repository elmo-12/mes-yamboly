import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { OrigenParada } from '@mes/types';

@Entity('parada')
export class Parada {
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  ordenId!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  @Column('text')
  maquinaId!: string;

  /** Causa específica (`PM-01-03`). */
  @Column('text')
  causaId!: string;

  /** Causa raíz / tipo (`PM-01`). */
  @Column('text')
  tipoCausaId!: string;

  @Column('text')
  inicio!: string;

  @Column('text', { nullable: true })
  fin!: string | null;

  @Column('integer', { default: 0 })
  duracionMin!: number;

  @Column('text')
  accionTomada!: string;

  @Column('text', { nullable: true })
  numeroSolicitud?: string | null;

  @Column('text', { nullable: true })
  evidenciaUrl?: string | null;

  @Column('boolean', { default: true })
  afectaOee!: boolean;

  @Column('text')
  responsableId!: string;

  @Column('text', { default: 'manual' })
  origen!: OrigenParada;

  @Column('text', { nullable: true })
  deteccionId?: string | null;

  /** Segundos que tardó el registro en la app — alimenta el KPI TRI. */
  @Column('integer', { default: 0 })
  tiempoRegistroSeg!: number;

  @Column('text', { nullable: true })
  comentarioCierre?: string | null;
}
