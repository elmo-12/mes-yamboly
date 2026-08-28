import { Column, Entity, PrimaryColumn } from 'typeorm';
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
}
