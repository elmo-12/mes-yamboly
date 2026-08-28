import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Colaborador, Sede as SedeDto, User as UserDto } from '@mes/types';
import { toUserDto } from '../../common/mappers/user.mapper';
import { toList } from '../../common/utils/query';
import { Sede, User } from '../../database/entities';
import { colaboradoresBase } from '../../database/seeds/data/users';

export interface UsuariosQuery {
  /** Repetible (`?rol=maquinista&rol=supervisor`) o separado por comas. */
  rol?: string | string[];
  sedeId?: string;
  lineaId?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    @InjectRepository(Sede) private readonly sedes: Repository<Sede>,
  ) {}

  async listar(query: UsuariosQuery = {}): Promise<UserDto[]> {
    const roles = toList(query.rol);
    const filas = await this.usuarios.find({ order: { id: 'ASC' } });
    return filas
      .filter((u) => (roles.length > 0 ? roles.includes(u.rol) : true))
      .filter((u) => (query.sedeId ? u.sedeId === query.sedeId : true))
      // Sin línea = transversal (jefe, supervisores, calidad): aparece en toda línea.
      .filter((u) => (query.lineaId ? !u.lineaId || u.lineaId === query.lineaId : true))
      .map(toUserDto);
  }

  /** Cuadrilla del turno para el paso «Equipo» de la orden de fabricación. */
  listarColaboradores(): Colaborador[] {
    return colaboradoresBase;
  }

  async listarSedes(): Promise<SedeDto[]> {
    return this.sedes.find({ order: { id: 'ASC' } });
  }
}
