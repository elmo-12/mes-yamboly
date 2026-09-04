import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  BajaCausaParadaResponse,
  BajaLogicaResponse,
  CausaMerma as CausaMermaDto,
  CausaMermaNodo,
  CausaParada as CausaParadaDto,
  CausaParadaNodo,
  EstadoCatalogo,
  Linea as LineaDto,
  Maquina as MaquinaDto,
  Producto as ProductoDto,
  Sabor as SaborDto,
  Sede as SedeDto,
  TipoMermaCodigo,
  TipoProcesoLinea,
  TurnoDef,
  VelocidadEstandar as VelocidadEstandarDto,
  VelocidadEstandarListItem,
} from '@mes/types';
import {
  ConflictoException,
  NoEncontradoException,
  ValidationException,
} from '../../common/exceptions/business.exception';
import { normalizar, redondear, toList } from '../../common/utils/query';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  Sabor,
  Sede,
  Turno,
  VelocidadEstandar,
} from '../../database/entities';
import type { CreateCausaMermaDto, UpdateCausaMermaDto } from './dto/causa-merma.dto';
import type { CreateCausaParadaDto, UpdateCausaParadaDto } from './dto/causa-parada.dto';
import type { CreateMaquinaDto, UpdateMaquinaDto } from './dto/maquina.dto';
import type { CreateProductoDto, ProductoQueryDto, UpdateProductoDto } from './dto/producto.dto';
import type { CreateSedeDto, UpdateSedeDto } from './dto/sede.dto';
import type {
  CreateVelocidadEstandarDto,
  UpdateVelocidadEstandarDto,
  VelocidadEstandarQueryDto,
} from './dto/velocidad-estandar.dto';

const GUION = '—';

/** Reconstruye un árbol de causas (parada o merma) a partir de `parentId`. */
function construirArbol<T extends { id: string; parentId: string | null }>(
  causas: T[],
): (T & { hijos: (T & { hijos: unknown[] })[] })[] {
  type Nodo = T & { hijos: Nodo[] };
  const nodos = new Map<string, Nodo>();
  for (const c of causas) nodos.set(c.id, { ...c, hijos: [] } as Nodo);
  const raices: Nodo[] = [];
  for (const nodo of nodos.values()) {
    if (nodo.parentId) nodos.get(nodo.parentId)?.hijos.push(nodo);
    else raices.push(nodo);
  }
  return raices as (T & { hijos: (T & { hijos: unknown[] })[] })[];
}

/** `velocidadUnidMin = velocidadUnidHora / 60` redondeado a 1 decimal. */
export function unidadesPorMinuto(velocidadUnidHora: number): number {
  return redondear(velocidadUnidHora / 60, 1);
}

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(Turno) private readonly turnos: Repository<Turno>,
    @InjectRepository(Sede) private readonly sedes: Repository<Sede>,
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
    @InjectRepository(Sabor) private readonly sabores: Repository<Sabor>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
    @InjectRepository(VelocidadEstandar)
    private readonly velocidades: Repository<VelocidadEstandar>,
    @InjectRepository(Maquina) private readonly maquinas: Repository<Maquina>,
    @InjectRepository(CausaParada) private readonly causasParada: Repository<CausaParada>,
    @InjectRepository(CausaMerma) private readonly causasMerma: Repository<CausaMerma>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Turnos                                                            */
  /* ---------------------------------------------------------------- */

  listarTurnos(): Promise<TurnoDef[]> {
    return this.turnos.find({ order: { id: 'ASC' } });
  }

  /* ---------------------------------------------------------------- */
  /* Sedes                                                             */
  /* ---------------------------------------------------------------- */

  listarSedes(): Promise<SedeDto[]> {
    return this.sedes.find({ order: { id: 'ASC' } });
  }

  async crearSede(dto: CreateSedeDto): Promise<SedeDto> {
    const duplicada = await this.sedes.findOne({ where: { codigo: dto.codigo } });
    if (duplicada) {
      throw new ConflictoException('Ya existe una sede con ese código', { codigo: dto.codigo });
    }
    /* Misma convención que el maestro real: `SED-AREQUIPA`, `SED-LIMA`. */
    const slug = normalizar(dto.nombre)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = `SED-${slug || dto.codigo}`;
    if (await this.sedes.findOne({ where: { id } })) {
      throw new ConflictoException('Ya existe una sede con ese nombre', { nombre: dto.nombre });
    }
    const sede = this.sedes.create({
      id,
      codigo: dto.codigo,
      nombre: dto.nombre,
      ciudad: dto.ciudad,
      activa: dto.activa ?? true,
    });
    return this.sedes.save(sede);
  }

  async actualizarSede(id: string, dto: UpdateSedeDto): Promise<SedeDto> {
    const sede = await this.sedes.findOne({ where: { id } });
    if (!sede) throw new NoEncontradoException('Sede');
    if (dto.codigo && dto.codigo !== sede.codigo) {
      const duplicada = await this.sedes.findOne({ where: { codigo: dto.codigo } });
      if (duplicada) {
        throw new ConflictoException('Ya existe una sede con ese código', { codigo: dto.codigo });
      }
    }
    Object.assign(sede, dto);
    return this.sedes.save(sede);
  }

  /* ---------------------------------------------------------------- */
  /* Sabores                                                           */
  /* ---------------------------------------------------------------- */

  async listarSabores(estado?: EstadoCatalogo): Promise<SaborDto[]> {
    const filas = await this.sabores.find({ order: { nombre: 'ASC' } });
    return estado ? filas.filter((s) => s.estado === estado) : filas;
  }

  /* ---------------------------------------------------------------- */
  /* Líneas                                                            */
  /* ---------------------------------------------------------------- */

  async listarLineas(
    sedeId?: string,
    tipoProceso?: TipoProcesoLinea,
    estado?: EstadoCatalogo,
  ): Promise<LineaDto[]> {
    const filas = await this.lineas.find({ order: { id: 'ASC' } });
    return filas
      .filter((l) => (sedeId ? l.sedeId === sedeId : true))
      .filter((l) => (tipoProceso ? l.tipoProceso === tipoProceso : true))
      .filter((l) => (estado ? l.estado === estado : true));
  }

  /* ---------------------------------------------------------------- */
  /* Productos                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * `lineaId` filtra por par producto × línea **activo**; `search` busca por
   * código, nombre o descripciones (sin tildes, sin distinguir mayúsculas).
   */
  async listarProductos(query: ProductoQueryDto = {}): Promise<ProductoDto[]> {
    let filas = await this.productos.find({ order: { codigo: 'ASC' } });

    if (query.lineaId) {
      const pares = await this.velocidades.find({
        where: { lineaId: query.lineaId, estado: 'activo' },
      });
      const conPar = new Set(pares.map((p) => p.productoId));
      filas = filas.filter((p) => conPar.has(p.id));
    }
    if (query.estado) filas = filas.filter((p) => p.estado === query.estado);
    if (query.search) {
      const texto = normalizar(query.search);
      filas = filas.filter((p) =>
        [p.codigo, p.nombre, p.descripcionCorta, p.descripcionLarga, p.alias ?? '']
          .map(normalizar)
          .some((campo) => campo.includes(texto)),
      );
    }
    return filas;
  }

  async crearProducto(dto: CreateProductoDto): Promise<ProductoDto> {
    const duplicado = await this.productos.findOne({ where: { codigo: dto.codigo } });
    if (duplicado) {
      throw new ConflictoException('Ya existe un producto con ese código', { codigo: dto.codigo });
    }
    const producto = this.productos.create({
      id: `PRD-${dto.codigo}`,
      codigo: dto.codigo,
      nombre: dto.nombre,
      descripcionLarga: dto.descripcionLarga,
      descripcionCorta: dto.descripcionCorta,
      alias: dto.alias ?? null,
      marca: dto.marca ?? null,
      presentacion: dto.presentacion ?? null,
      unidadesPorCaja: dto.unidadesPorCaja ?? 1,
      pesoKg: dto.pesoKg,
      saborId: dto.saborId ?? null,
      sabor: dto.sabor ?? '',
      estado: dto.estado ?? 'activo',
    });
    return this.productos.save(producto);
  }

  async actualizarProducto(id: string, dto: UpdateProductoDto): Promise<ProductoDto> {
    const producto = await this.productos.findOne({ where: { id } });
    if (!producto) throw new NoEncontradoException('Producto');
    if (dto.codigo && dto.codigo !== producto.codigo) {
      const duplicado = await this.productos.findOne({ where: { codigo: dto.codigo } });
      if (duplicado) {
        throw new ConflictoException('Ya existe un producto con ese código', {
          codigo: dto.codigo,
        });
      }
    }
    Object.assign(producto, dto);
    return this.productos.save(producto);
  }

  /** Baja lógica: el producto pasa a `inactivo` y conserva sus órdenes. */
  async darDeBajaProducto(id: string): Promise<BajaLogicaResponse> {
    const producto = await this.productos.findOne({ where: { id } });
    if (!producto) throw new NoEncontradoException('Producto');
    const conservados = await this.ordenes.count({ where: { productoId: id } });
    producto.estado = 'inactivo';
    await this.productos.save(producto);
    return {
      id: producto.id,
      codigo: producto.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes',
      mensaje: `Hay ${conservados} órdenes con este producto; se conservarán con el código ${producto.codigo}.`,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Velocidades estándar (pares producto × línea)                     */
  /* ---------------------------------------------------------------- */

  private async enriquecerPares(
    pares: VelocidadEstandar[],
  ): Promise<VelocidadEstandarListItem[]> {
    const [productos, lineas] = await Promise.all([this.productos.find(), this.lineas.find()]);
    const porProducto = new Map(productos.map((p) => [p.id, p]));
    const porLinea = new Map(lineas.map((l) => [l.id, l]));
    return pares.map((par) => {
      const producto = porProducto.get(par.productoId);
      const linea = porLinea.get(par.lineaId);
      return {
        ...par,
        productoCodigo: producto?.codigo ?? GUION,
        productoNombre: producto?.nombre ?? GUION,
        lineaCodigo: linea?.codigo ?? GUION,
        lineaNombre: linea?.nombre ?? GUION,
        tipoProceso: linea?.tipoProceso ?? 'llenadora',
      };
    });
  }

  async listarVelocidadesEstandar(
    query: VelocidadEstandarQueryDto = {},
  ): Promise<VelocidadEstandarListItem[]> {
    let filas = await this.velocidades.find({ order: { id: 'ASC' } });
    if (query.productoId) filas = filas.filter((v) => v.productoId === query.productoId);
    if (query.lineaId) filas = filas.filter((v) => v.lineaId === query.lineaId);
    if (query.estado) filas = filas.filter((v) => v.estado === query.estado);
    return this.enriquecerPares(filas);
  }

  async crearVelocidadEstandar(
    dto: CreateVelocidadEstandarDto,
  ): Promise<VelocidadEstandarDto> {
    const [producto, linea] = await Promise.all([
      this.productos.findOne({ where: { id: dto.productoId } }),
      this.lineas.findOne({ where: { id: dto.lineaId } }),
    ]);
    if (!producto) throw new ValidationException({ productoId: 'El producto no existe' });
    if (!linea) throw new ValidationException({ lineaId: 'La línea no existe' });

    const existente = await this.velocidades.findOne({
      where: { productoId: dto.productoId, lineaId: dto.lineaId },
    });
    if (existente) {
      throw new ConflictoException('Ya existe una velocidad para ese producto y línea', {
        productoId: dto.productoId,
        lineaId: dto.lineaId,
      });
    }

    const total = await this.velocidades.count();
    const par = this.velocidades.create({
      id: `VE-${String(total + 1).padStart(4, '0')}`,
      productoId: dto.productoId,
      lineaId: dto.lineaId,
      velocidadUnidHora: dto.velocidadUnidHora,
      velocidadUnidMin: unidadesPorMinuto(dto.velocidadUnidHora),
      mermaEstandarPct: dto.mermaEstandarPct ?? 0,
      cipMin: dto.cipMin ?? null,
      arranqueMin: dto.arranqueMin ?? null,
      estado: dto.estado ?? 'activo',
    });
    return this.velocidades.save(par);
  }

  async actualizarVelocidadEstandar(
    id: string,
    dto: UpdateVelocidadEstandarDto,
  ): Promise<VelocidadEstandarDto> {
    const par = await this.velocidades.findOne({ where: { id } });
    if (!par) throw new NoEncontradoException('Velocidad estándar');

    const productoId = dto.productoId ?? par.productoId;
    const lineaId = dto.lineaId ?? par.lineaId;
    if (productoId !== par.productoId || lineaId !== par.lineaId) {
      const duplicado = await this.velocidades.findOne({ where: { productoId, lineaId } });
      if (duplicado && duplicado.id !== par.id) {
        throw new ConflictoException('Ya existe una velocidad para ese producto y línea', {
          productoId,
          lineaId,
        });
      }
    }

    Object.assign(par, dto);
    if (dto.velocidadUnidHora !== undefined) {
      par.velocidadUnidMin = unidadesPorMinuto(dto.velocidadUnidHora);
    }
    return this.velocidades.save(par);
  }

  /** Baja lógica: el par pasa a `inactivo`; las órdenes que lo congelaron siguen válidas. */
  async darDeBajaVelocidadEstandar(id: string): Promise<BajaLogicaResponse> {
    const par = await this.velocidades.findOne({ where: { id } });
    if (!par) throw new NoEncontradoException('Velocidad estándar');
    const conservados = await this.ordenes.count({ where: { velocidadEstandarId: id } });
    par.estado = 'inactivo';
    await this.velocidades.save(par);
    return {
      id: par.id,
      codigo: par.id,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes',
      mensaje: `Hay ${conservados} órdenes que congelaron esta velocidad; se conservarán con su valor.`,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Máquinas (equipos de la línea)                                    */
  /* ---------------------------------------------------------------- */

  async listarMaquinas(lineaId?: string, estado?: string | string[]): Promise<MaquinaDto[]> {
    const estados = toList(estado);
    const filas = await this.maquinas.find({ order: { id: 'ASC' } });
    return filas
      .filter((m) => (lineaId ? m.lineaId === lineaId : true))
      .filter((m) => (estados.length > 0 ? estados.includes(m.estado) : true));
  }

  async crearMaquina(dto: CreateMaquinaDto): Promise<MaquinaDto> {
    const existente = await this.maquinas.findOne({ where: { codigo: dto.codigo } });
    if (existente) {
      throw new ConflictoException('Ya existe una máquina con ese código', { codigo: dto.codigo });
    }
    const total = await this.maquinas.count();
    const maquina = this.maquinas.create({
      id: `MAQ-${String(total + 1).padStart(2, '0')}`,
      codigo: dto.codigo,
      nombre: dto.nombre,
      tipo: dto.tipo,
      lineaId: dto.lineaId,
      estado: dto.estado ?? 'operativa',
      paradas30d: 0,
    });
    return this.maquinas.save(maquina);
  }

  async actualizarMaquina(id: string, dto: UpdateMaquinaDto): Promise<MaquinaDto> {
    const maquina = await this.maquinas.findOne({ where: { id } });
    if (!maquina) throw new NoEncontradoException('Máquina');
    if (dto.codigo && dto.codigo !== maquina.codigo) {
      const duplicada = await this.maquinas.findOne({ where: { codigo: dto.codigo } });
      if (duplicada) {
        throw new ConflictoException('Ya existe una máquina con ese código', { codigo: dto.codigo });
      }
    }
    Object.assign(maquina, dto);
    return this.maquinas.save(maquina);
  }

  /** Baja lógica: la máquina pasa a `baja` y conserva sus paradas históricas. */
  async darDeBajaMaquina(id: string): Promise<BajaLogicaResponse> {
    const maquina = await this.maquinas.findOne({ where: { id } });
    if (!maquina) throw new NoEncontradoException('Máquina');
    const conservados = await this.paradas.count({ where: { maquinaId: id } });
    maquina.estado = 'baja';
    await this.maquinas.save(maquina);
    return {
      id: maquina.id,
      codigo: maquina.codigo,
      estado: 'baja',
      conservados,
      etiquetaConservados: 'paradas',
      mensaje: `Hay ${conservados} paradas registradas en esta máquina; se conservarán con el código ${maquina.codigo}.`,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Causas de parada                                                  */
  /* ---------------------------------------------------------------- */

  async listarCausasParada(
    formato: 'arbol' | 'plano' = 'arbol',
    nivel?: string,
    lineaId?: string,
  ): Promise<CausaParadaDto[] | CausaParadaNodo[]> {
    let causas: CausaParadaDto[] = await this.causasParada.find({ order: { codigo: 'ASC' } });
    if (lineaId) {
      causas = causas.filter(
        (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(lineaId),
      );
    }
    if (nivel) causas = causas.filter((c) => c.nivel === nivel);
    if (formato === 'plano' || nivel) return causas;
    return construirArbol(causas) as CausaParadaNodo[];
  }

  async crearCausaParada(dto: CreateCausaParadaDto): Promise<CausaParadaDto> {
    const existente = await this.causasParada.findOne({ where: { codigo: dto.codigo } });
    if (existente) {
      throw new ConflictoException('Ya existe una causa con ese código', { codigo: dto.codigo });
    }
    const causa = this.causasParada.create({
      id: `CPA-${dto.codigo}`,
      codigo: dto.codigo,
      nombre: dto.nombre,
      nivel: dto.nivel,
      parentId: dto.parentId ?? null,
      clasificacion: dto.clasificacion ?? 'imprevista',
      afectaOee: dto.afectaOee ?? true,
      requiereEvidencia: dto.requiereEvidencia ?? false,
      requiereSolicitud: dto.requiereSolicitud ?? false,
      tiempoEstandarMin: dto.tiempoEstandarMin ?? 0,
      lineasAplicables: dto.lineasAplicables ?? [],
      estado: dto.estado ?? 'activo',
      paradasHistoricas: 0,
      codigoLegado: dto.codigoLegado ?? null,
    });
    return this.causasParada.save(causa);
  }

  async actualizarCausaParada(id: string, dto: UpdateCausaParadaDto): Promise<CausaParadaDto> {
    const causa = await this.causasParada.findOne({ where: { id } });
    if (!causa) throw new NoEncontradoException('Causa de parada');
    Object.assign(causa, dto);
    return this.causasParada.save(causa);
  }

  /**
   * Baja lógica: la causa nunca se borra; se marca `inactivo` y se informa
   * cuántas paradas históricas conservan el código.
   */
  async darDeBajaCausaParada(id: string): Promise<BajaCausaParadaResponse> {
    const causa = await this.causasParada.findOne({ where: { id } });
    if (!causa) throw new NoEncontradoException('Causa de parada');
    const conservados =
      (await this.paradas.count({ where: { causaId: id } })) + causa.paradasHistoricas;
    causa.estado = 'inactivo';
    await this.causasParada.save(causa);
    return {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      paradasConservadas: conservados,
      etiquetaConservados: 'paradas',
      mensaje: `Hay ${conservados} paradas históricas con esta causa; se conservarán con el código ${causa.codigo}.`,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Causas de merma (árbol Tipo → Clasificación → Causa)              */
  /* ---------------------------------------------------------------- */

  async listarCausasMerma(
    formato: 'arbol' | 'plano' = 'arbol',
    nivel?: string,
    tipo?: TipoMermaCodigo,
    lineaId?: string,
  ): Promise<CausaMermaDto[] | CausaMermaNodo[]> {
    let causas: CausaMermaDto[] = await this.causasMerma.find({ order: { codigo: 'ASC' } });
    if (lineaId) {
      causas = causas.filter(
        (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(lineaId),
      );
    }
    if (tipo) causas = causas.filter((c) => c.aplicaA.length === 0 || c.aplicaA.includes(tipo));
    if (nivel) causas = causas.filter((c) => c.nivel === nivel);
    if (formato === 'plano' || nivel) return causas;
    return construirArbol(causas) as CausaMermaNodo[];
  }

  async crearCausaMerma(dto: CreateCausaMermaDto): Promise<CausaMermaDto> {
    const existente = await this.causasMerma.findOne({ where: { codigo: dto.codigo } });
    if (existente) {
      throw new ConflictoException('Ya existe una causa con ese código', { codigo: dto.codigo });
    }
    const causa = this.causasMerma.create({
      id: `CME-${dto.codigo}`,
      codigo: dto.codigo,
      nombre: dto.nombre,
      nivel: dto.nivel,
      parentId: dto.parentId ?? null,
      aplicaA: dto.aplicaA ?? [],
      lineasAplicables: dto.lineasAplicables ?? [],
      requiereEvidencia: dto.requiereEvidencia ?? false,
      requiereComentario: dto.requiereComentario ?? false,
      requiereSolicitud: dto.requiereSolicitud ?? false,
      estado: dto.estado ?? 'activo',
      mermasHistoricas: 0,
    });
    return this.causasMerma.save(causa);
  }

  async actualizarCausaMerma(id: string, dto: UpdateCausaMermaDto): Promise<CausaMermaDto> {
    const causa = await this.causasMerma.findOne({ where: { id } });
    if (!causa) throw new NoEncontradoException('Causa de merma');
    Object.assign(causa, dto);
    return this.causasMerma.save(causa);
  }

  /** Baja lógica: la causa pasa a `inactivo` y conserva sus mermas históricas. */
  async darDeBajaCausaMerma(id: string): Promise<BajaLogicaResponse> {
    const causa = await this.causasMerma.findOne({ where: { id } });
    if (!causa) throw new NoEncontradoException('Causa de merma');
    const conservados =
      (await this.mermas.count({ where: { causaId: id } })) + causa.mermasHistoricas;
    causa.estado = 'inactivo';
    await this.causasMerma.save(causa);
    return {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'mermas',
      mensaje: `Hay ${conservados} mermas históricas con esta causa; se conservarán con el código ${causa.codigo}.`,
    };
  }
}
