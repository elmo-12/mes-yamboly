import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { TipoMermaCodigo } from '@mes/types';
import { ImportacionFuente } from './importacion-fuente.entity';
import { Linea } from './linea.entity';
import { Producto } from './producto.entity';

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

  /** FK real sobre `importacionId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => ImportacionFuente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'importacionId' })
  importacion?: ImportacionFuente | null;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @ManyToOne(() => Linea, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;

  /** FK real sobre `productoCodigo` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Producto, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productoCodigo', referencedColumnName: 'codigo' })
  producto?: Producto | null;
}
