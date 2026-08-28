import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { DatasetExport, EstadoExport, FormatoExport } from '@mes/types';

/** Trabajo de exportación de Reportes (spec 06.D) y de Evidencia (spec 09.F). */
@Entity('export_job')
export class ExportJob {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  nombre!: string;

  @Column('simple-json', { default: '[]' })
  datasets!: DatasetExport[];

  @Column('text', { default: 'xlsx' })
  formato!: FormatoExport;

  @Column('text')
  solicitadoEn!: string;

  @Column('text')
  solicitadoPor!: string;

  @Column('text', { default: 'generando' })
  estado!: EstadoExport;

  @Column('text', { nullable: true })
  tamano?: string | null;

  @Column('text', { nullable: true })
  url?: string | null;

  /** Ruta absoluta del archivo generado en `data/exports/`. */
  @Column('text', { nullable: true })
  rutaArchivo?: string | null;

  @Column('text', { nullable: true })
  desde?: string | null;

  @Column('text', { nullable: true })
  hasta?: string | null;

  @Column('text', { nullable: true })
  lineaId?: string | null;
}
