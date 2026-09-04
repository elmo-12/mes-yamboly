import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('sede')
export class Sede {
  @PrimaryColumn('text')
  id!: string;

  /** Código corto de 3–4 letras mayúsculas: `LIMA`, `AREQ`, `CHIC`, `TARA`. */
  @Column('text', { unique: true, default: '' })
  codigo!: string;

  @Column('text')
  nombre!: string;

  @Column('text')
  ciudad!: string;

  @Column('boolean', { default: true })
  activa!: boolean;
}
