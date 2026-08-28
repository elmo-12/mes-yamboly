import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo, TipoMermaCodigo } from '@mes/types';

@Entity('causa_merma')
export class CausaMerma {
  @PrimaryColumn('text')
  id!: string;

  @Column('text', { unique: true })
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('simple-json', { default: '[]' })
  aplicaA!: TipoMermaCodigo[];

  @Column('boolean', { default: false })
  requiereEvidencia!: boolean;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;
}
