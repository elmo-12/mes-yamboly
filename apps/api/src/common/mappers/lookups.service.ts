import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  OrdenFabricacion,
  Producto,
  User,
} from '../../database/entities';

/** Índices por id de los catálogos, para resolver los textos de las filas. */
export interface Lookups {
  lineas: Map<string, Linea>;
  productos: Map<string, Producto>;
  maquinas: Map<string, Maquina>;
  causasParada: Map<string, CausaParada>;
  causasMerma: Map<string, CausaMerma>;
  usuarios: Map<string, User>;
  ordenCodigos: Map<string, string>;
}

function indexar<T extends { id: string }>(filas: T[]): Map<string, T> {
  return new Map(filas.map((f) => [f.id, f]));
}

/**
 * Carga los catálogos completos (tablas pequeñas y estables) para enriquecer
 * listados sin N+1. Disponible globalmente vía `CommonModule`.
 */
@Injectable()
export class LookupsService {
  constructor(
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
    @InjectRepository(Maquina) private readonly maquinas: Repository<Maquina>,
    @InjectRepository(CausaParada) private readonly causasParada: Repository<CausaParada>,
    @InjectRepository(CausaMerma) private readonly causasMerma: Repository<CausaMerma>,
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
  ) {}

  async load(): Promise<Lookups> {
    const [lineas, productos, maquinas, causasParada, causasMerma, usuarios, ordenes] =
      await Promise.all([
        this.lineas.find(),
        this.productos.find(),
        this.maquinas.find(),
        this.causasParada.find(),
        this.causasMerma.find(),
        this.usuarios.find(),
        this.ordenes.find({ select: { id: true, codigo: true } }),
      ]);

    return {
      lineas: indexar(lineas),
      productos: indexar(productos),
      maquinas: indexar(maquinas),
      causasParada: indexar(causasParada),
      causasMerma: indexar(causasMerma),
      usuarios: indexar(usuarios),
      ordenCodigos: new Map(ordenes.map((o) => [o.id, o.codigo])),
    };
  }

  /** Nombre legible de un usuario; «Sistema» cuando el id no existe. */
  static nombreUsuario(lookups: Lookups, id: string): string {
    return lookups.usuarios.get(id)?.nombre ?? 'Sistema';
  }

  static inicialesUsuario(lookups: Lookups, id: string): string {
    return lookups.usuarios.get(id)?.iniciales ?? 'SY';
  }
}
