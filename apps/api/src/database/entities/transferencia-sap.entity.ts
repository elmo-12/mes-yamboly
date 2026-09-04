import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { TipoMermaCodigo } from '@mes/types';

/**
 * Transferencia de merma registrada en SAP (`plantilla-transferencias-sap.xlsx`).
 * El criterio «Transferencia SAP» del TCI busca un documento con la misma línea
 * y producto, fecha dentro de ±`tciToleranciaDiasSap` y kilos dentro de
 * ±`tciToleranciaPct`.
 */
@Entity('transferencia_sap')
export class TransferenciaSap {
  /** `SAP-<documento>`. */
  @PrimaryColumn('text')
  id!: string;

  @Index()
  @Column('text')
  importacionId!: string;

  /** N.º de documento SAP: `4900012345`. */
  @Index({ unique: true })
  @Column('text')
  documento!: string;

  /** `YYYY-MM-DD` */
  @Column('text')
  fecha!: string;

  @Index()
  @Column('text')
  lineaId!: string;

  /** Código de producto de 7 dígitos del maestro real: `1120002`. */
  @Column('text')
  productoCodigo!: string;

  @Column('double precision', { default: 0 })
  cantidadKg!: number;

  /** `MP` · `EP` · `PT`; `null` si el archivo no lo trae. */
  @Column('text', { nullable: true })
  tipoMerma!: TipoMermaCodigo | null;

  @Column('text', { default: '' })
  motivo!: string;
}
