import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Anexo 05 — lista de cotejo de las 9 funcionalidades del sistema (CFS). */
@Entity('verificacion_funcional')
export class VerificacionFuncional {
  @PrimaryColumn('text')
  id!: string;

  @Column('integer', { default: 0 })
  n!: number;

  /** `RF3` */
  @Column('text')
  rf!: string;

  @Column('text')
  funcionalidad!: string;

  @Column('boolean', { default: false })
  cumple!: boolean;

  @Column('text', { default: '' })
  observacion!: string;

  /** Ruta de la pantalla que evidencia la funcionalidad. */
  @Column('text')
  ruta!: string;

  /**
   * ISO-8601 de la última verificación del investigador; `null` mientras nadie
   * la haya revisado. Sin esta marca no se puede distinguir «verificada y no
   * cumple» de «sin verificar», y el CFS arrancaría en 0 % en vez de sin datos.
   */
  @Column('text', { nullable: true, default: null })
  verificadaEn!: string | null;
}
