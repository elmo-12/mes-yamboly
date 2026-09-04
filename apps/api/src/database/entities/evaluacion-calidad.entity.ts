import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { ClaveCriterioTci, CriterioTCI, TipoRegistroTci, Turno } from '@mes/types';

/**
 * Anexo 03 — Ficha de evaluación de la calidad de la información (TCI).
 * Cada fila es un registro operativo (parada, merma o velocidad) contrastado
 * contra las fuentes externas importadas. La produce
 * `POST /evidencia/tci/validar`, que reemplaza las filas del rango validado
 * conservando los `overrides` que el usuario haya puesto a mano.
 */
@Entity('evaluacion_calidad')
export class EvaluacionCalidad {
  /** `TCI-<registroId>`: estable entre validaciones para conservar overrides. */
  @PrimaryColumn('text')
  id!: string;

  @Column('integer', { default: 0 })
  n!: number;

  /** `YYYY-MM-DD` del registro evaluado. */
  @Index()
  @Column('text')
  fecha!: string;

  @Column('text')
  turno!: Turno;

  @Index()
  @Column('text')
  tipoRegistro!: TipoRegistroTci;

  /** Id del registro operativo: `PAR-0815-03`, `MER-0815-01`, `VEL-0815-01`. */
  @Index()
  @Column('text')
  registroId!: string;

  @Column('text')
  lineaId!: string;

  @Column('text', { default: '' })
  lineaCodigo!: string;

  /** Resumen legible del registro: `07:42 · PP-01-10 · 14 min`. */
  @Column('text', { default: '' })
  referencia!: string;

  /**
   * Resultado **de las reglas**, con su detalle legible y sin los overrides
   * aplicados: así un override se puede quitar y recuperar el valor calculado.
   */
  @Column('simple-json', { default: '[]' })
  criterios!: CriterioTCI[];

  /** Valores forzados a mano por criterio; `null` = no hay ningún override. */
  @Column('simple-json', { nullable: true })
  overrides!: Partial<Record<ClaveCriterioTci, boolean>> | null;

  /** `true` si todos los criterios del tipo se cumplen. */
  @Column('boolean', { default: false })
  valido!: boolean;

  /** ISO-8601 de la validación que produjo la fila. */
  @Column('text', { default: '' })
  validadoEn!: string;

  /** `YYYY-MM-DD` del rango validado que generó la fila. */
  @Column('text', { default: '' })
  desde!: string;

  @Column('text', { default: '' })
  hasta!: string;

  @Column('text', { default: '' })
  observacion!: string;
}
