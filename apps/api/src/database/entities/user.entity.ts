import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Role } from '@mes/types';
import { Linea } from './linea.entity';

@Entity('usuario')
export class User {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  nombre!: string;

  @Column('text', { unique: true })
  email!: string;

  @Column('text', { unique: true })
  dni!: string;

  @Column('text')
  rol!: Role;

  @Column('text')
  cargo!: string;

  /**
   * Columna interna heredada: la aplicación opera una **única sede** (Lima).
   * No se expone en la API pública ni se filtra por ella; el valor es siempre
   * `SEDE_UNICA_ID`.
   */
  @Column('text', { default: 'SED-LIMA' })
  sedeId!: string;

  @Column('text', { nullable: true })
  lineaId?: string | null;

  @Column('text')
  iniciales!: string;

  @Column('text', { nullable: true })
  avatarUrl?: string | null;

  @Column('boolean', { default: true })
  activo!: boolean;

  /** Marca del último inicio de sesión; se sella en `POST /auth/login`. */
  @Column('text', { nullable: true })
  ultimoAcceso?: string | null;

  /** Hash bcrypt — nunca se expone en las respuestas. */
  @Column('text')
  passwordHash!: string;

  /** FK real sobre `lineaId` — no se carga (los servicios usan la columna escalar). */
  @Index()
  @ManyToOne(() => Linea, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'lineaId' })
  linea?: Linea | null;
}
