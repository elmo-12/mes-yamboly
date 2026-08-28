import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { Turno } from '@mes/types';

/**
 * Anexo 03 — Ficha de evaluación de la calidad de la información (TCI).
 * Los cuatro criterios se calculan por reglas sobre el registro evaluado y
 * pueden sobrescribirse manualmente (`override*`) desde la vista 09.C.
 */
@Entity('evaluacion_calidad')
export class EvaluacionCalidad {
  @PrimaryColumn('text')
  id!: string;

  @Column('integer', { default: 0 })
  n!: number;

  @Column('text')
  fecha!: string;

  @Column('text')
  turno!: Turno;

  /** Texto del registro evaluado: `Parada 07:42 · PL-03-02 · L2`. */
  @Column('text')
  registro!: string;

  /** Id del registro origen (parada/merma/velocidad) si existe. */
  @Column('text', { nullable: true })
  registroId?: string | null;

  /* --- Insumos de las reglas ------------------------------------- */

  /** Campos obligatorios presentes → criterio «completo». */
  @Column('boolean', { default: true })
  camposObligatoriosCompletos!: boolean;

  /** Duración en minutos; > 0 es condición del criterio «preciso». */
  @Column('real', { default: 0 })
  duracionMin!: number;

  /** Causa de último nivel asignada → criterio «preciso». */
  @Column('boolean', { default: true })
  causaEspecifica!: boolean;

  @Column('boolean', { default: true })
  tieneOrden!: boolean;

  @Column('boolean', { default: true })
  tieneMaquina!: boolean;

  @Column('boolean', { default: true })
  tieneResponsable!: boolean;

  /* --- Override manual ------------------------------------------- */

  @Column('boolean', { nullable: true })
  overrideCompleto!: boolean | null;

  @Column('boolean', { nullable: true })
  overridePreciso!: boolean | null;

  @Column('boolean', { nullable: true })
  overrideTrazable!: boolean | null;

  @Column('text', { default: '' })
  observacion!: string;
}
