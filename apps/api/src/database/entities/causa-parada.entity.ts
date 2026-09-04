import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo, NivelCausa } from '@mes/types';

@Entity('causa_parada')
export class CausaParada {
  @PrimaryColumn('text')
  id!: string;

  @Column('text', { unique: true })
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('text')
  nivel!: NivelCausa;

  @Column('text', { nullable: true })
  parentId!: string | null;

  @Column('text', { default: 'imprevista' })
  clasificacion!: 'programada' | 'imprevista';

  @Column('boolean', { default: true })
  afectaOee!: boolean;

  @Column('boolean', { default: false })
  requiereEvidencia!: boolean;

  @Column('boolean', { default: false })
  requiereSolicitud!: boolean;

  @Column('integer', { default: 0 })
  tiempoEstandarMin!: number;

  @Column('simple-json', { default: '[]' })
  lineasAplicables!: string[];

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;

  @Column('integer', { default: 0 })
  paradasHistoricas!: number;

  /** Código del sistema original (`PNP`, `RUT04`, `FAL02`, `IMP10`); `null` si no existía. */
  @Column('text', { nullable: true })
  codigoLegado!: string | null;

  /** FK real sobre `parentId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => CausaParada, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent?: CausaParada | null;
}
