import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EstadoCatalogo, NivelCausaMerma, TipoMermaCodigo } from '@mes/types';

/**
 * Causa de merma del maestro real, con el mismo patrón de árbol de 3 niveles
 * que las causas de parada: tipo → clasificación → causa.
 */
@Entity('causa_merma')
export class CausaMerma {
  @PrimaryColumn('text')
  id!: string;

  /** `MP-01` (tipo) · `MP-01-A` (clasificación) · `MP-01-01` (causa). */
  @Column('text', { unique: true })
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('text', { default: 'causa' })
  nivel!: NivelCausaMerma;

  /** Id del nodo padre; `null` en los tipos raíz (`MP-01` … `MP-05`). */
  @Column('text', { nullable: true })
  parentId!: string | null;

  @Column('simple-json', { default: '[]' })
  aplicaA!: TipoMermaCodigo[];

  /** Ids de líneas donde aplica; vacío = todas. */
  @Column('simple-json', { default: '[]' })
  lineasAplicables!: string[];

  @Column('boolean', { default: false })
  requiereEvidencia!: boolean;

  /** Obliga a `observacion` en el wizard de merma. */
  @Column('boolean', { default: false })
  requiereComentario!: boolean;

  /** Obliga a `numeroSolicitud` en el wizard de merma. */
  @Column('boolean', { default: false })
  requiereSolicitud!: boolean;

  @Column('text', { default: 'activo' })
  estado!: EstadoCatalogo;

  /** Nº de mermas históricas — se conservan aunque se dé de baja la causa. */
  @Column('integer', { default: 0 })
  mermasHistoricas!: number;
}
