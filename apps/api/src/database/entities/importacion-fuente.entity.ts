import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { TipoFuenteExterna } from '@mes/types';

/**
 * Bitácora de una importación de fuente externa (XLSX/CSV).
 * Cada archivo subido deja una fila: quién, cuándo, cuántas filas entraron y
 * qué periodo cubren. Las importaciones **acumulan**: los duplicados exactos se
 * ignoran, no se borra lo anterior.
 */
@Entity('importacion_fuente')
export class ImportacionFuente {
  /** `IMP-SEN-001`, `IMP-SOL-001`, `IMP-SAP-001`. */
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  tipo!: TipoFuenteExterna;

  /** Nombre original del archivo subido. */
  @Column('text')
  archivo!: string;

  /** ISO-8601 local de la importación. */
  @Column('text')
  importadoEn!: string;

  /** Nombre del usuario que subió el archivo. */
  @Column('text')
  importadoPor!: string;

  @Column('integer', { default: 0 })
  filasOk!: number;

  @Column('integer', { default: 0 })
  filasRechazadas!: number;

  /** Filas idénticas a datos ya importados; se ignoran sin contar como error. */
  @Column('integer', { default: 0 })
  filasDuplicadas!: number;

  /** `YYYY-MM-DD` de la fila más antigua aceptada; `null` si no entró ninguna. */
  @Column('text', { nullable: true })
  desde!: string | null;

  @Column('text', { nullable: true })
  hasta!: string | null;
}
