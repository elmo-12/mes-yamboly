import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Configuración singleton de umbrales del motor de alertas (spec 07.F / 10.C). */
@Entity('umbrales')
export class Umbrales {
  /** Siempre `UMB-01`: la tabla es un singleton. */
  @PrimaryColumn('text')
  id!: string;

  @Column('real', { default: 5 })
  velocidadBajoEstandarPct!: number;

  @Column('real', { default: 75 })
  oeeMinimo!: number;

  @Column('real', { default: 70 })
  probabilidadMinima!: number;

  @Column('boolean', { default: true })
  notificarN8n!: boolean;

  @Column('boolean', { default: true })
  mostrarTv!: boolean;

  /* --- Validación de calidad (TCI) · Configuración 10.C -------------- */

  /** Tolerancia en minutos entre horas registradas y lecturas de sensor. */
  @Column('real', { default: 5 })
  tciToleranciaMin!: number;

  /** Tolerancia porcentual en cantidades (kg vs SAP) y velocidades. */
  @Column('real', { default: 5 })
  tciToleranciaPct!: number;

  /** Días de holgura entre la fecha de la merma y la de su transferencia SAP. */
  @Column('integer', { default: 1 })
  tciToleranciaDiasSap!: number;

  @Column('text')
  actualizadoEn!: string;

  @Column('text')
  actualizadoPor!: string;
}
