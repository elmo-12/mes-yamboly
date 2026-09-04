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
  Sabor,
  User,
  VelocidadEstandar,
} from '../../database/entities';

/** Clave del índice de pares producto × línea: `${productoId}|${lineaId}`. */
export function clavePar(productoId: string, lineaId: string): string {
  return `${productoId}|${lineaId}`;
}

/** Índices por id de los catálogos, para resolver los textos de las filas. */
export interface Lookups {
  lineas: Map<string, Linea>;
  productos: Map<string, Producto>;
  sabores: Map<string, Sabor>;
  maquinas: Map<string, Maquina>;
  causasParada: Map<string, CausaParada>;
  causasMerma: Map<string, CausaMerma>;
  usuarios: Map<string, User>;
  ordenCodigos: Map<string, string>;
  /** Pares producto × línea indexados por {@link clavePar}. */
  velocidadesEstandar: Map<string, VelocidadEstandar>;
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
    @InjectRepository(Sabor) private readonly sabores: Repository<Sabor>,
    @InjectRepository(Maquina) private readonly maquinas: Repository<Maquina>,
    @InjectRepository(CausaParada) private readonly causasParada: Repository<CausaParada>,
    @InjectRepository(CausaMerma) private readonly causasMerma: Repository<CausaMerma>,
    @InjectRepository(User) private readonly usuarios: Repository<User>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(VelocidadEstandar)
    private readonly velocidades: Repository<VelocidadEstandar>,
  ) {}

  async load(): Promise<Lookups> {
    const [
      lineas,
      productos,
      sabores,
      maquinas,
      causasParada,
      causasMerma,
      usuarios,
      ordenes,
      velocidades,
    ] = await Promise.all([
      this.lineas.find(),
      this.productos.find(),
      this.sabores.find(),
      this.maquinas.find(),
      this.causasParada.find(),
      this.causasMerma.find(),
      this.usuarios.find(),
      this.ordenes.find({ select: { id: true, codigo: true } }),
      this.velocidades.find(),
    ]);

    return {
      lineas: indexar(lineas),
      productos: indexar(productos),
      sabores: indexar(sabores),
      maquinas: indexar(maquinas),
      causasParada: indexar(causasParada),
      causasMerma: indexar(causasMerma),
      usuarios: indexar(usuarios),
      ordenCodigos: new Map(ordenes.map((o) => [o.id, o.codigo])),
      velocidadesEstandar: new Map(
        velocidades.map((v) => [clavePar(v.productoId, v.lineaId), v]),
      ),
    };
  }

  /** Nombre legible de un usuario; «Sistema» cuando el id no existe. */
  static nombreUsuario(lookups: Lookups, id: string): string {
    return lookups.usuarios.get(id)?.nombre ?? 'Sistema';
  }

  static inicialesUsuario(lookups: Lookups, id: string): string {
    return lookups.usuarios.get(id)?.iniciales ?? 'SY';
  }

  /** Par activo producto × línea; `undefined` si no existe o está inactivo. */
  static parActivo(
    lookups: Lookups,
    productoId: string,
    lineaId: string,
  ): VelocidadEstandar | undefined {
    const par = lookups.velocidadesEstandar.get(clavePar(productoId, lineaId));
    return par && par.estado === 'activo' ? par : undefined;
  }
}
