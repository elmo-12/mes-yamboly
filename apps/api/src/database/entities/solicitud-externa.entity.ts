import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Solicitud de mantenimiento/merma del sistema externo
 * (`plantilla-solicitudes.xlsx`). El criterio «N.º de solicitud» del TCI se
 * cumple cuando el número anotado en la parada o la merma existe aquí.
 */
@Entity('solicitud_externa')
export class SolicitudExterna {
  /** `SOL-<numero normalizado>`. */
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  importacionId!: string;

  /** Número tal como lo emite el sistema externo: `SM-2026-0421`. */
  @Index({ unique: true })
  @Column('text')
  numero!: string;

  /** `YYYY-MM-DD` */
  @Column('text')
  fecha!: string;

  /** Línea a la que se asoció la solicitud; `null` si el archivo no la trae. */
  @Column('text', { nullable: true })
  lineaId!: string | null;

  /** `MANTENIMIENTO` · `MERMA` · `OTRO`. */
  @Column('text', { default: 'MANTENIMIENTO' })
  tipo!: string;

  /** `ABIERTA` · `ATENDIDA` · `CERRADA`. */
  @Column('text', { default: 'ABIERTA' })
  estado!: string;

  @Column('text', { default: '' })
  descripcion!: string;
}
