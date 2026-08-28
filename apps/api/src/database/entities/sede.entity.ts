import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('sede')
export class Sede {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  nombre!: string;

  @Column('text')
  ciudad!: string;

  @Column('boolean', { default: true })
  activa!: boolean;
}
