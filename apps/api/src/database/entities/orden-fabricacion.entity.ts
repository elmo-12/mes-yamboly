import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { Colaborador, EstadoOrden, OeeDetalle, Turno as TurnoCodigo } from '@mes/types';

@Entity('orden_fabricacion')
export class OrdenFabricacion {
  @PrimaryColumn('text')
  id!: string;

  @Index({ unique: true })
  @Column('text')
  codigo!: string;

  /** `YYYY-MM-DD` */
  @Column('text')
  fecha!: string;

  @Column('text')
  lineaId!: string;

  @Column('text')
  productoId!: string;

  @Column('text')
  turno!: TurnoCodigo;

  @Column('text')
  lote!: string;

  @Column('text')
  vencimiento!: string;

  @Column('integer', { default: 0 })
  planificado!: number;

  @Column('integer', { default: 0 })
  producido!: number;

  @Column('integer', { default: 0 })
  conteoCodificadora!: number;

  @Column('integer', { default: 0 })
  velocidadEstandar!: number;

  @Column('text', { default: 'en_curso' })
  estado!: EstadoOrden;

  @Column('text')
  maquinistaId!: string;

  @Column('text')
  supervisorId!: string;

  @Column('integer', { default: 0 })
  operarios!: number;

  @Column('simple-json', { default: '[]' })
  colaboradores!: Colaborador[];

  @Column('simple-json')
  oee!: OeeDetalle;

  @Column('integer', { default: 0 })
  paradasCount!: number;

  @Column('real', { default: 0 })
  mermasKg!: number;

  @Column('text')
  inicio!: string;

  @Column('text', { nullable: true })
  fin!: string | null;

  @Column('text', { nullable: true })
  observacion?: string | null;
}
