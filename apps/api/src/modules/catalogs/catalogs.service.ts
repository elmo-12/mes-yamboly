import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ObjectLiteral, Repository } from 'typeorm';
import type {
  BajaCausaParadaResponse,
  BajaLogicaResponse,
  CausaMerma as CausaMermaDto,
  CausaMermaNodo,
  CausaParada as CausaParadaDto,
  CausaParadaNodo,
  EstadoCatalogo,
  Linea as LineaDto,
  LineaListItem,
  NodoCausaBase,
  Producto as ProductoDto,
  Sabor as SaborDto,
  TipoMermaCodigo,
  TipoProcesoLinea,
  TurnoDef,
  VelocidadEstandar as VelocidadEstandarDto,
  VelocidadEstandarListItem,
} from '@mes/types';
import { MENSAJE_CONFLICTO_VERSION, SEDE_UNICA_ID } from '@mes/types';
import {
  ConflictoException,
  ValidationException,
} from '../../common/exceptions/business.exception';
import { normalizar, redondear } from '../../common/utils/query';
import { ahoraPlanta } from '@mes/shared';
import { normalizarIsoLocal, sumarDiasLocal } from '../../common/utils/fechas';
import { esClaveDuplicada, insertarConIdSecuencial, insertarCopia } from '../../common/utils/ids';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  Sabor,
  Turno,
  VelocidadEstandar,
} from '../../database/entities';
import type { CreateCausaMermaDto, UpdateCausaMermaDto } from './dto/causa-merma.dto';
import type { CreateCausaParadaDto, UpdateCausaParadaDto } from './dto/causa-parada.dto';
import type { CreateLineaDto, UpdateLineaDto } from './dto/linea.dto';
import type { CreateProductoDto, ProductoQueryDto, UpdateProductoDto } from './dto/producto.dto';
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
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
    @InjectRepository(Sabor) private readonly sabores: Repository<Sabor>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
    @InjectRepository(VelocidadEstandar)
    private readonly velocidades: Repository<VelocidadEstandar>,
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
  /* Sabores                                                           */
  /* ---------------------------------------------------------------- */

  async listarSabores(estado?: EstadoCatalogo): Promise<SaborDto[]> {
    const filas = await this.sabores.find({ order: { nombre: 'ASC' } });
    return estado ? filas.filter((s) => s.estado === estado) : filas;
  }

  /* ---------------------------------------------------------------- */
  /* Líneas (mantenedor: la línea es la máquina física)                */
  /* ---------------------------------------------------------------- */

  /** Ventana de referencia del contador `paradas30d` de cada línea. */
  private static readonly DIAS_VENTANA_PARADAS = 30;

  /**
   * Paradas por línea en los últimos 30 días. Con datos de demostración
   * congelados la referencia no es el reloj del servidor sino la parada más
   * reciente del conjunto, para que el contador nunca salga en cero.
   */
  private async paradasPorLinea30d(): Promise<Map<string, number>> {
    /* Una fila con `inicio` malformado o futuro no puede tumbar el listado de
     * líneas (antes `"abc"` lanzaba RangeError → 500) ni correr la ventana. */
    const ahora = ahoraPlanta();
    const paradas = (await this.paradas.find({ select: { lineaId: true, inicio: true } })).filter(
      (p) => normalizarIsoLocal(p.inicio) !== null && p.inicio <= ahora,
    );
    const conteo = new Map<string, number>();
    if (paradas.length === 0) return conteo;
    const ultima = paradas.reduce((max, p) => (p.inicio > max ? p.inicio : max), paradas[0]!.inicio);
    /* ISO local contra ISO local: `toISOString()` sobre una hora local la
     * desplazaba a UTC (+5 h en Lima). */
    const limite = sumarDiasLocal(ultima, -CatalogsService.DIAS_VENTANA_PARADAS);
    for (const p of paradas) {
      if (p.inicio >= limite) conteo.set(p.lineaId, (conteo.get(p.lineaId) ?? 0) + 1);
    }
    return conteo;
  }

  private async enriquecerLineas(lineas: Linea[]): Promise<LineaListItem[]> {
    const [pares, paradas30d] = await Promise.all([
      this.velocidades.find({ where: { estado: 'activo' }, select: { lineaId: true } }),
      this.paradasPorLinea30d(),
    ]);
    const conVelocidad = new Map<string, number>();
    for (const par of pares) {
      conVelocidad.set(par.lineaId, (conVelocidad.get(par.lineaId) ?? 0) + 1);
    }
    return lineas.map((l) => ({
      ...this.aLineaDto(l),
      productosConVelocidad: conVelocidad.get(l.id) ?? 0,
      paradas30d: paradas30d.get(l.id) ?? 0,
    }));
  }

  /** Proyección pública de la línea: la columna interna `sedeId` no se expone. */
  private aLineaDto(linea: Linea): LineaDto {
    return {
      id: linea.id,
      codigo: linea.codigo,
      nombre: linea.nombre,
      nombreCorto: linea.nombreCorto,
      tipoProceso: linea.tipoProceso,
      estado: linea.estado,
      capacidadUnidadesMin: linea.capacidadUnidadesMin,
      version: linea.version ?? 1,
    };
  }

  async listarLineas(
    tipoProceso?: TipoProcesoLinea,
    estado?: EstadoCatalogo,
  ): Promise<LineaListItem[]> {
    const filas = await this.lineas.find({ order: { id: 'ASC' } });
    return this.enriquecerLineas(
      filas
        .filter((l) => (tipoProceso ? l.tipoProceso === tipoProceso : true))
        .filter((l) => (estado ? l.estado === estado : true)),
    );
  }

  async crearLinea(dto: CreateLineaDto): Promise<LineaDto> {
    const id = `LIN-${dto.codigo}`;
    await this.verificarAltaLibre(this.lineas, id, dto.codigo, 'una línea');
    const linea = this.lineas.create({
      id,
      codigo: dto.codigo,
      nombre: dto.nombre,
      nombreCorto: dto.nombreCorto,
      tipoProceso: dto.tipoProceso,
      sedeId: SEDE_UNICA_ID,
      estado: dto.estado ?? 'activo',
      capacidadUnidadesMin: dto.capacidadUnidadesMin ?? 0,
      version: 1,
    });
    await this.insertar(this.lineas, linea, 'Ya existe una línea con ese código', dto.codigo);
    return this.aLineaDto(linea);
  }

  async actualizarLinea(id: string, dto: UpdateLineaDto): Promise<LineaDto> {
    const linea = await this.lineas.findOne({ where: { id } });
    if (!linea) throw new RecursoNoEncontradoException('Línea no encontrada');
    verificarInmutable('codigo', linea.codigo, dto.codigo, 'El código de la línea no se puede modificar: lo referencian órdenes y paradas');
    rechazarNulos(dto, ['nombre', 'nombreCorto', 'tipoProceso', 'estado', 'capacidadUnidadesMin']);
    const { version, codigo: _codigo, ...cambios } = dto;
    const pasaAInactiva = linea.estado === 'activo' && cambios.estado === 'inactivo';
    Object.assign(linea, cambios);
    await this.guardarConVersion(this.lineas, linea, version);
    if (pasaAInactiva) await this.bajaParesDe({ lineaId: id });
    return this.aLineaDto(linea);
  }

  /**
   * Baja lógica: la línea pasa a `inactivo`, conserva su histórico
   * (`conservados` = órdenes + paradas de la línea) y sus pares producto ×
   * línea también se dan de baja (una línea inactiva no puede ofrecer
   * velocidades). Reactivar la línea no reactiva sus pares: se revisan uno a uno.
   */
  async darDeBajaLinea(id: string): Promise<BajaLogicaResponse> {
    const linea = await this.lineas.findOne({ where: { id } });
    if (!linea) throw new RecursoNoEncontradoException('Línea no encontrada');
    const [ordenes, paradas] = await Promise.all([
      this.ordenes.count({ where: { lineaId: id } }),
      this.paradas.count({ where: { lineaId: id } }),
    ]);
    const conservados = ordenes + paradas;
    if (linea.estado !== 'inactivo') {
      linea.estado = 'inactivo';
      await this.guardarConVersion(this.lineas, linea);
    }
    const pares = await this.bajaParesDe({ lineaId: id });
    return {
      id: linea.id,
      codigo: linea.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes y paradas',
      mensaje:
        `Hay ${conservados} órdenes y paradas registradas en esta línea; se conservarán con el código ${linea.codigo}.` +
        (pares > 0 ? ` También se dieron de baja ${pares} velocidades estándar de la línea.` : ''),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Productos                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * `lineaId` filtra por par producto × línea **activo** y sólo devuelve
   * productos activos; `search` busca por código, nombre o descripciones (sin
   * tildes, sin distinguir mayúsculas).
   */
  async listarProductos(query: ProductoQueryDto = {}): Promise<ProductoDto[]> {
    let filas = await this.productos.find({ order: { codigo: 'ASC' } });

    if (query.lineaId) {
      const pares = await this.velocidades.find({
        where: { lineaId: query.lineaId, estado: 'activo' },
      });
      const conPar = new Set(pares.map((p) => p.productoId));
      filas = filas.filter((p) => conPar.has(p.id) && p.estado === 'activo');
    }
    if (query.estado) filas = filas.filter((p) => p.estado === query.estado);
    if (query.search) {
      const texto = normalizar(query.search);
      filas = filas.filter((p) =>
        [p.codigo, p.nombre, p.descripcionCorta, p.descripcionLarga, p.alias ?? '', p.sabor ?? '']
          .map(normalizar)
          .some((campo) => campo.includes(texto)),
      );
    }
    return filas.map((p) => this.aProductoDto(p));
  }

  /** El texto `sabor` se deriva siempre de `saborId` (antes quedaba vacío). */
  private async resolverSabor(saborId: string | null): Promise<string> {
    if (!saborId) return '';
    const sabor = await this.sabores.findOne({ where: { id: saborId } });
    if (!sabor) throw new ValidationException({ saborId: 'El sabor no existe' });
    return sabor.nombre;
  }

  async crearProducto(dto: CreateProductoDto): Promise<ProductoDto> {
    const id = `PRD-${dto.codigo}`;
    await this.verificarAltaLibre(this.productos, id, dto.codigo, 'un producto');
    const saborId = dto.saborId ?? null;
    const sabor = saborId ? await this.resolverSabor(saborId) : (dto.sabor ?? '');
    const producto = this.productos.create({
      id,
      codigo: dto.codigo,
      nombre: dto.nombre,
      descripcionLarga: dto.descripcionLarga,
      descripcionCorta: dto.descripcionCorta,
      alias: dto.alias ?? null,
      marca: dto.marca ?? null,
      presentacion: dto.presentacion ?? null,
      unidadesPorCaja: dto.unidadesPorCaja ?? 1,
      pesoKg: dto.pesoKg,
      saborId,
      sabor,
      estado: dto.estado ?? 'activo',
      version: 1,
    });
    await this.insertar(this.productos, producto, 'Ya existe un producto con ese código', dto.codigo);
    return this.aProductoDto(producto);
  }

  async actualizarProducto(id: string, dto: UpdateProductoDto): Promise<ProductoDto> {
    const producto = await this.productos.findOne({ where: { id } });
    if (!producto) throw new RecursoNoEncontradoException('Producto no encontrado');
    verificarInmutable('codigo', producto.codigo, dto.codigo, 'El código del producto no se puede modificar: lo referencian las órdenes');
    rechazarNulos(dto, ['nombre', 'descripcionLarga', 'descripcionCorta', 'unidadesPorCaja', 'pesoKg', 'estado', 'sabor']);
    const { version, codigo: _codigo, ...cambios } = dto;
    if (cambios.saborId !== undefined) {
      cambios.sabor = await this.resolverSabor(cambios.saborId ?? null);
    }
    const pasaAInactivo = producto.estado === 'activo' && cambios.estado === 'inactivo';
    Object.assign(producto, cambios);
    await this.guardarConVersion(this.productos, producto, version);
    if (pasaAInactivo) await this.bajaParesDe({ productoId: id });
    return this.aProductoDto(producto);
  }

  /**
   * Baja lógica: el producto pasa a `inactivo`, conserva sus órdenes y sus
   * pares producto × línea se dan de baja con él.
   */
  async darDeBajaProducto(id: string): Promise<BajaLogicaResponse> {
    const producto = await this.productos.findOne({ where: { id } });
    if (!producto) throw new RecursoNoEncontradoException('Producto no encontrado');
    const conservados = await this.ordenes.count({ where: { productoId: id } });
    if (producto.estado !== 'inactivo') {
      producto.estado = 'inactivo';
      await this.guardarConVersion(this.productos, producto);
    }
    const pares = await this.bajaParesDe({ productoId: id });
    return {
      id: producto.id,
      codigo: producto.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes',
      mensaje:
        `Hay ${conservados} órdenes con este producto; se conservarán con el código ${producto.codigo}.` +
        (pares > 0 ? ` También se dieron de baja sus ${pares} velocidades estándar.` : ''),
    };
  }

  private aProductoDto(p: Producto): ProductoDto {
    const { saborRef: _saborRef, ...dto } = p;
    return dto;
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
      const { producto: _p, linea: _l, ...dto } = par;
      return {
        ...dto,
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

  /** Mayor correlativo `VE-####` en uso; 0 si aún no hay pares. */
  private async maximoCorrelativoVelocidad(): Promise<number> {
    const pares = await this.velocidades.find({ select: { id: true } });
    return pares.reduce((maximo, { id }) => Math.max(maximo, Number(id.slice(3)) || 0), 0);
  }

  /**
   * Un par sólo puede quedar activo si su producto y su línea existen y están
   * activos (422 en otro caso; antes un id inexistente acababa en 500 por FK).
   */
  private async verificarProductoYLinea(
    productoId: string,
    lineaId: string,
    exigirActivos: boolean,
  ): Promise<void> {
    const [producto, linea] = await Promise.all([
      this.productos.findOne({ where: { id: productoId } }),
      this.lineas.findOne({ where: { id: lineaId } }),
    ]);
    if (!producto) throw new ValidationException({ productoId: 'El producto no existe' });
    if (!linea) throw new ValidationException({ lineaId: 'La línea no existe' });
    if (!exigirActivos) return;
    if (producto.estado !== 'activo') {
      throw new ValidationException({ productoId: 'El producto está inactivo; actívalo primero' });
    }
    if (linea.estado !== 'activo') {
      throw new ValidationException({ lineaId: 'La línea está inactiva; actívala primero' });
    }
  }

  async crearVelocidadEstandar(
    dto: CreateVelocidadEstandarDto,
  ): Promise<VelocidadEstandarDto> {
    const estado = dto.estado ?? 'activo';
    const existente = await this.velocidades.findOne({
      where: { productoId: dto.productoId, lineaId: dto.lineaId },
    });
    if (existente) {
      throw new ConflictoException('Ya existe una velocidad para ese producto y línea', {
        productoId: dto.productoId,
        lineaId: dto.lineaId,
      });
    }
    await this.verificarProductoYLinea(dto.productoId, dto.lineaId, estado === 'activo');

    /* El correlativo arranca en el id máximo + 1 (no en `count() + 1`: el
       maestro tiene huecos hasta VE-0340 y reutilizar un id hueco podría
       enlazar órdenes históricas a un par nuevo). `insertarConIdSecuencial`
       hace INSERT puro y reintenta ante clave duplicada (altas simultáneas). */
    const [maximo, total] = await Promise.all([
      this.maximoCorrelativoVelocidad(),
      this.velocidades.count(),
    ]);
    const desfase = maximo - total;
    const par = this.velocidades.create({
      id: '',
      productoId: dto.productoId,
      lineaId: dto.lineaId,
      velocidadUnidHora: dto.velocidadUnidHora,
      velocidadUnidMin: unidadesPorMinuto(dto.velocidadUnidHora),
      mermaEstandarPct: dto.mermaEstandarPct ?? 0,
      cipMin: dto.cipMin ?? null,
      arranqueMin: dto.arranqueMin ?? null,
      estado,
      version: 1,
    });
    try {
      await insertarConIdSecuencial(this.velocidades, par, (n) =>
        `VE-${String(n + desfase).padStart(4, '0')}`,
      );
    } catch (error) {
      /* El índice único (productoId, lineaId) también salta si otra petición
         creó el mismo par a la vez. */
      if (esClaveDuplicada(error)) {
        throw new ConflictoException('Ya existe una velocidad para ese producto y línea', {
          productoId: dto.productoId,
          lineaId: dto.lineaId,
        });
      }
      throw error;
    }
    return this.aParDto(par);
  }

  async actualizarVelocidadEstandar(
    id: string,
    dto: UpdateVelocidadEstandarDto,
  ): Promise<VelocidadEstandarDto> {
    const par = await this.velocidades.findOne({ where: { id } });
    if (!par) throw new RecursoNoEncontradoException('Velocidad estándar no encontrada');
    rechazarNulos(dto, ['productoId', 'lineaId', 'velocidadUnidHora', 'mermaEstandarPct', 'estado']);

    const { version, ...cambios } = dto;
    const productoId = cambios.productoId ?? par.productoId;
    const lineaId = cambios.lineaId ?? par.lineaId;
    const estado = cambios.estado ?? par.estado;
    const cambiaPar = productoId !== par.productoId || lineaId !== par.lineaId;
    const seActiva = estado === 'activo' && (par.estado !== 'activo' || cambiaPar);
    if (cambiaPar || seActiva) await this.verificarProductoYLinea(productoId, lineaId, estado === 'activo');
    if (cambiaPar) {
      const duplicado = await this.velocidades.findOne({ where: { productoId, lineaId } });
      if (duplicado && duplicado.id !== par.id) {
        throw new ConflictoException('Ya existe una velocidad para ese producto y línea', {
          productoId,
          lineaId,
        });
      }
    }

    Object.assign(par, cambios);
    if (cambios.velocidadUnidHora !== undefined) {
      par.velocidadUnidMin = unidadesPorMinuto(cambios.velocidadUnidHora);
    }
    await this.guardarConVersion(this.velocidades, par, version);
    return this.aParDto(par);
  }

  /** Baja lógica: el par pasa a `inactivo`; las órdenes que lo congelaron siguen válidas. */
  async darDeBajaVelocidadEstandar(id: string): Promise<BajaLogicaResponse> {
    const par = await this.velocidades.findOne({ where: { id } });
    if (!par) throw new RecursoNoEncontradoException('Velocidad estándar no encontrada');
    const conservados = await this.ordenes.count({ where: { velocidadEstandarId: id } });
    if (par.estado !== 'inactivo') {
      par.estado = 'inactivo';
      await this.guardarConVersion(this.velocidades, par);
    }
    return {
      id: par.id,
      codigo: par.id,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes',
      mensaje: `Hay ${conservados} órdenes que congelaron esta velocidad; se conservarán con su valor.`,
    };
  }

  /** Da de baja los pares activos de una línea o de un producto; devuelve cuántos. */
  private async bajaParesDe(filtro: { lineaId: string } | { productoId: string }): Promise<number> {
    const pares = await this.velocidades.find({ where: { ...filtro, estado: 'activo' } });
    for (const par of pares) {
      par.estado = 'inactivo';
      await this.guardarConVersion(this.velocidades, par);
    }
    return pares.length;
  }

  private aParDto(par: VelocidadEstandar): VelocidadEstandarDto {
    const { producto: _p, linea: _l, ...dto } = par;
    return dto;
  }

  /* ---------------------------------------------------------------- */
  /* Árbol de causas: reglas comunes a parada y merma                  */
  /* ---------------------------------------------------------------- */

  /** Nº de registros por `causaId` (agregado al consultar, nunca una columna muerta). */
  private async conteoPorCausa(repo: Repository<Parada> | Repository<Merma>): Promise<Map<string, number>> {
    const filas = await (repo as Repository<Parada>)
      .createQueryBuilder('r')
      .select('r.causaId', 'causaId')
      .addSelect('COUNT(*)', 'total')
      .groupBy('r.causaId')
      .getRawMany<{ causaId: string; total: string | number }>();
    return new Map(filas.map((f) => [f.causaId, Number(f.total)]));
  }

  /**
   * Valida la posición de un nodo nuevo en el árbol de 3 niveles: el tipo es
   * raíz con código `XX-NN`; el nivel 2 cuelga de un tipo y su código es
   * `<tipo>-<sufijo>`; el nivel 3 cuelga de un nivel 2 y comparte el prefijo
   * `XX-NN` del tipo. El padre debe existir y estar activo.
   */
  private validarJerarquia(
    nivel: string,
    codigo: string,
    padre: NodoCausaBase | null,
    niveles: readonly [string, string, string],
    parentIdEnviado: string | null,
  ): void {
    const [nivelTipo, nivelMedio] = niveles;
    const prefijoTipo = (c: string) => c.split('-').slice(0, 2).join('-');
    if (nivel === nivelTipo) {
      if (parentIdEnviado) throw new ValidationException({ parentId: 'Un tipo es raíz: no lleva nodo padre' });
      if (codigo.split('-').length !== 2) {
        throw new ValidationException({ codigo: 'El código de un tipo tiene dos segmentos (p. ej. PN-02)' });
      }
      return;
    }
    if (!parentIdEnviado) throw new ValidationException({ parentId: 'Selecciona el nodo padre' });
    if (!padre) throw new ValidationException({ parentId: 'El nodo padre no existe' });
    if (padre.estado !== 'activo') {
      throw new ValidationException({ parentId: 'El nodo padre está inactivo; actívalo primero' });
    }
    const nivelPadreEsperado = nivel === nivelMedio ? nivelTipo : nivelMedio;
    if (padre.nivel !== nivelPadreEsperado) {
      throw new ValidationException({ parentId: `El padre de este nivel debe ser de nivel «${nivelPadreEsperado}»` });
    }
    if (codigo.split('-').length !== 3) {
      throw new ValidationException({ codigo: 'El código de este nivel tiene tres segmentos (p. ej. PN-02-A o PN-02-01)' });
    }
    if (prefijoTipo(codigo) !== prefijoTipo(padre.codigo)) {
      throw new ValidationException({
        codigo: `El código debe empezar por ${prefijoTipo(padre.codigo)}- (el de su tipo)`,
      });
    }
  }

  /** `codigo`, `nivel` y `parentId` definen el id y la posición: no cambian. */
  private verificarPosicionInmutable(
    causa: NodoCausaBase,
    dto: { codigo?: string; nivel?: string; parentId?: string | null },
  ): void {
    verificarInmutable('codigo', causa.codigo, dto.codigo, 'El código de la causa no se puede modificar: lo referencian los registros históricos');
    verificarInmutable('nivel', causa.nivel, dto.nivel, 'El nivel de la causa no se puede modificar');
    if (dto.parentId !== undefined && (dto.parentId ?? null) !== (causa.parentId ?? null)) {
      throw new ValidationException({ parentId: 'El nodo padre no se puede modificar' });
    }
  }

  /** Ids de todo el subárbol bajo `id` (sin incluirlo). */
  private descendientes<T extends { id: string; parentId: string | null }>(todas: T[], id: string): T[] {
    const hijos = new Map<string, T[]>();
    for (const c of todas) {
      if (!c.parentId) continue;
      hijos.set(c.parentId, [...(hijos.get(c.parentId) ?? []), c]);
    }
    const resultado: T[] = [];
    const pendientes = [...(hijos.get(id) ?? [])];
    const vistos = new Set<string>([id]);
    while (pendientes.length > 0) {
      const nodo = pendientes.shift()!;
      if (vistos.has(nodo.id)) continue;
      vistos.add(nodo.id);
      resultado.push(nodo);
      pendientes.push(...(hijos.get(nodo.id) ?? []));
    }
    return resultado;
  }

  /* ---------------------------------------------------------------- */
  /* Causas de parada                                                  */
  /* ---------------------------------------------------------------- */

  private static readonly NIVELES_PARADA = ['tipo', 'general', 'especifica'] as const;

  async listarCausasParada(
    formato: 'arbol' | 'plano' = 'arbol',
    nivel?: string,
    lineaId?: string,
  ): Promise<CausaParadaDto[] | CausaParadaNodo[]> {
    const [filas, conteo] = await Promise.all([
      this.causasParada.find({ order: { codigo: 'ASC' } }),
      this.conteoPorCausa(this.paradas),
    ]);
    let causas: CausaParadaDto[] = filas.map((c) => this.aCausaParadaDto(c, conteo));
    if (lineaId) {
      causas = causas.filter(
        (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(lineaId),
      );
    }
    if (nivel) causas = causas.filter((c) => c.nivel === nivel);
    if (formato === 'plano' || nivel) return causas;
    return construirArbol(causas) as CausaParadaNodo[];
  }

  /** `paradasHistoricas` = paradas con esta causa + histórico heredado del maestro. */
  private aCausaParadaDto(c: CausaParada, conteo: Map<string, number>): CausaParadaDto {
    const { parent: _parent, ...dto } = c;
    return { ...dto, paradasHistoricas: (conteo.get(c.id) ?? 0) + (c.paradasHistoricas ?? 0) };
  }

  async crearCausaParada(dto: CreateCausaParadaDto): Promise<CausaParadaDto> {
    const id = `CPA-${dto.codigo}`;
    await this.verificarAltaLibre(this.causasParada, id, dto.codigo, 'una causa');
    const parentId = dto.parentId ?? null;
    const padre = parentId ? await this.causasParada.findOne({ where: { id: parentId } }) : null;
    this.validarJerarquia(dto.nivel, dto.codigo, padre, CatalogsService.NIVELES_PARADA, parentId);
    const causa = this.causasParada.create({
      id,
      codigo: dto.codigo,
      nombre: dto.nombre,
      nivel: dto.nivel,
      parentId,
      /* La clasificación (planificada / no planificada) se hereda del tipo:
         una hija de PP-01 nunca puede quedar como imprevista. */
      clasificacion: padre ? padre.clasificacion : (dto.clasificacion ?? 'imprevista'),
      afectaOee: dto.afectaOee ?? true,
      requiereEvidencia: dto.requiereEvidencia ?? false,
      requiereSolicitud: dto.requiereSolicitud ?? false,
      tiempoEstandarMin: dto.tiempoEstandarMin ?? 0,
      lineasAplicables: dto.lineasAplicables ?? [],
      estado: dto.estado ?? 'activo',
      paradasHistoricas: 0,
      codigoLegado: dto.codigoLegado ?? null,
      version: 1,
    });
    await this.insertar(this.causasParada, causa, 'Ya existe una causa con ese código', dto.codigo);
    return this.aCausaParadaDto(causa, new Map());
  }

  /**
   * Edición: código, nivel y padre son inmutables. La clasificación sólo se
   * edita en un tipo y se propaga a todo su subárbol. Pasar a `inactivo` da
   * de baja también el subárbol; reactivar exige que el padre esté activo.
   */
  async actualizarCausaParada(id: string, dto: UpdateCausaParadaDto): Promise<CausaParadaDto> {
    const causa = await this.causasParada.findOne({ where: { id } });
    if (!causa) throw new RecursoNoEncontradoException('Causa de parada no encontrada');
    this.verificarPosicionInmutable(causa, dto);
    rechazarNulos(dto, ['nombre', 'clasificacion', 'afectaOee', 'requiereEvidencia', 'requiereSolicitud', 'tiempoEstandarMin', 'lineasAplicables', 'estado']);
    const { version, codigo: _c, nivel: _n, parentId: _p, ...cambios } = dto;

    const cambiaClasificacion =
      cambios.clasificacion !== undefined && cambios.clasificacion !== causa.clasificacion;
    if (cambiaClasificacion && causa.nivel !== 'tipo') {
      throw new ValidationException({
        clasificacion: 'La clasificación se hereda del tipo; cámbiala en el tipo raíz',
      });
    }
    await this.verificarReactivacion(this.causasParada, causa, cambios.estado);
    const pasaAInactiva = causa.estado === 'activo' && cambios.estado === 'inactivo';

    Object.assign(causa, cambios);
    await this.guardarConVersion(this.causasParada, causa, version);

    if (cambiaClasificacion || pasaAInactiva) {
      const subarbol = this.descendientes(await this.causasParada.find(), id);
      for (const hija of subarbol) {
        const antes = { clasificacion: hija.clasificacion, estado: hija.estado };
        if (cambiaClasificacion) hija.clasificacion = causa.clasificacion;
        if (pasaAInactiva) hija.estado = 'inactivo';
        if (antes.clasificacion !== hija.clasificacion || antes.estado !== hija.estado) {
          await this.guardarConVersion(this.causasParada, hija);
        }
      }
    }
    return this.aCausaParadaDto(causa, await this.conteoPorCausa(this.paradas));
  }

  /**
   * Baja lógica: la causa nunca se borra; se marca `inactivo` junto con todo
   * su subárbol (una hija activa bajo un padre inactivo seguía ofreciéndose en
   * los wizards) y se informa cuántas paradas históricas conservan el código.
   */
  async darDeBajaCausaParada(id: string): Promise<BajaCausaParadaResponse> {
    const causa = await this.causasParada.findOne({ where: { id } });
    if (!causa) throw new RecursoNoEncontradoException('Causa de parada no encontrada');
    const conteo = await this.conteoPorCausa(this.paradas);
    const conservados = (conteo.get(id) ?? 0) + (causa.paradasHistoricas ?? 0);
    const hijas = await this.bajaSubarbol(this.causasParada, causa);
    return {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      paradasConservadas: conservados,
      etiquetaConservados: 'paradas',
      mensaje:
        `Hay ${conservados} paradas históricas con esta causa; se conservarán con el código ${causa.codigo}.` +
        (hijas > 0 ? ` También se dieron de baja ${hijas} causas que dependían de ella.` : ''),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Causas de merma (árbol Tipo → Clasificación → Causa)              */
  /* ---------------------------------------------------------------- */

  private static readonly NIVELES_MERMA = ['tipo', 'clasificacion', 'causa'] as const;

  async listarCausasMerma(
    formato: 'arbol' | 'plano' = 'arbol',
    nivel?: string,
    tipo?: TipoMermaCodigo,
    lineaId?: string,
  ): Promise<CausaMermaDto[] | CausaMermaNodo[]> {
    const [filas, conteo] = await Promise.all([
      this.causasMerma.find({ order: { codigo: 'ASC' } }),
      this.conteoPorCausa(this.mermas),
    ]);
    let causas: CausaMermaDto[] = filas.map((c) => this.aCausaMermaDto(c, conteo));
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

  /** `mermasHistoricas` = mermas con esta causa + histórico heredado del maestro. */
  private aCausaMermaDto(c: CausaMerma, conteo: Map<string, number>): CausaMermaDto {
    const { parent: _parent, ...dto } = c;
    return { ...dto, mermasHistoricas: (conteo.get(c.id) ?? 0) + (c.mermasHistoricas ?? 0) };
  }

  async crearCausaMerma(dto: CreateCausaMermaDto): Promise<CausaMermaDto> {
    const id = `CME-${dto.codigo}`;
    await this.verificarAltaLibre(this.causasMerma, id, dto.codigo, 'una causa');
    const parentId = dto.parentId ?? null;
    const padre = parentId ? await this.causasMerma.findOne({ where: { id: parentId } }) : null;
    this.validarJerarquia(dto.nivel, dto.codigo, padre, CatalogsService.NIVELES_MERMA, parentId);
    const causa = this.causasMerma.create({
      id,
      codigo: dto.codigo,
      nombre: dto.nombre,
      nivel: dto.nivel,
      parentId,
      aplicaA: dto.aplicaA ?? [],
      lineasAplicables: dto.lineasAplicables ?? [],
      requiereEvidencia: dto.requiereEvidencia ?? false,
      requiereComentario: dto.requiereComentario ?? false,
      requiereSolicitud: dto.requiereSolicitud ?? false,
      estado: dto.estado ?? 'activo',
      mermasHistoricas: 0,
      version: 1,
    });
    await this.insertar(this.causasMerma, causa, 'Ya existe una causa con ese código', dto.codigo);
    return this.aCausaMermaDto(causa, new Map());
  }

  async actualizarCausaMerma(id: string, dto: UpdateCausaMermaDto): Promise<CausaMermaDto> {
    const causa = await this.causasMerma.findOne({ where: { id } });
    if (!causa) throw new RecursoNoEncontradoException('Causa de merma no encontrada');
    this.verificarPosicionInmutable(causa, dto);
    rechazarNulos(dto, ['nombre', 'aplicaA', 'lineasAplicables', 'requiereEvidencia', 'requiereComentario', 'requiereSolicitud', 'estado']);
    const { version, codigo: _c, nivel: _n, parentId: _p, ...cambios } = dto;
    await this.verificarReactivacion(this.causasMerma, causa, cambios.estado);
    const pasaAInactiva = causa.estado === 'activo' && cambios.estado === 'inactivo';
    Object.assign(causa, cambios);
    await this.guardarConVersion(this.causasMerma, causa, version);
    if (pasaAInactiva) {
      for (const hija of this.descendientes(await this.causasMerma.find(), id)) {
        if (hija.estado === 'inactivo') continue;
        hija.estado = 'inactivo';
        await this.guardarConVersion(this.causasMerma, hija);
      }
    }
    return this.aCausaMermaDto(causa, await this.conteoPorCausa(this.mermas));
  }

  /** Baja lógica: la causa y su subárbol pasan a `inactivo`; conservan sus mermas. */
  async darDeBajaCausaMerma(id: string): Promise<BajaLogicaResponse> {
    const causa = await this.causasMerma.findOne({ where: { id } });
    if (!causa) throw new RecursoNoEncontradoException('Causa de merma no encontrada');
    const conteo = await this.conteoPorCausa(this.mermas);
    const conservados = (conteo.get(id) ?? 0) + (causa.mermasHistoricas ?? 0);
    const hijas = await this.bajaSubarbol(this.causasMerma, causa);
    return {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'mermas',
      mensaje:
        `Hay ${conservados} mermas históricas con esta causa; se conservarán con el código ${causa.codigo}.` +
        (hijas > 0 ? ` También se dieron de baja ${hijas} causas que dependían de ella.` : ''),
    };
  }

  /** Marca inactivo el nodo y su subárbol; devuelve cuántas hijas cambiaron. */
  private async bajaSubarbol<T extends ObjectLiteral & NodoVersionado>(
    repo: Repository<T>,
    causa: T,
  ): Promise<number> {
    if (causa.estado !== 'inactivo') {
      causa.estado = 'inactivo';
      await this.guardarConVersion(repo, causa);
    }
    let hijas = 0;
    for (const hija of this.descendientes(await repo.find(), causa.id)) {
      if (hija.estado === 'inactivo') continue;
      hija.estado = 'inactivo';
      await this.guardarConVersion(repo, hija);
      hijas++;
    }
    return hijas;
  }

  /** Reactivar una causa exige que su padre esté activo (si no, quedaría huérfana en los wizards). */
  private async verificarReactivacion<T extends ObjectLiteral & NodoVersionado>(
    repo: Repository<T>,
    causa: T,
    estado: EstadoCatalogo | undefined,
  ): Promise<void> {
    if (estado !== 'activo' || causa.estado === 'activo' || !causa.parentId) return;
    const padre = await repo.findOne({ where: { id: causa.parentId } as never });
    if (padre && padre.estado !== 'activo') {
      throw new ValidationException({
        estado: `Activa primero el nodo padre ${padre.codigo}`,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Altas e ediciones seguras                                         */
  /* ---------------------------------------------------------------- */

  /**
   * 409 si el código **o el id derivado** ya existen. Antes sólo se miraba el
   * código y `save()` con un id existente hacía UPDATE: recrear el código de
   * una línea renombrada sobrescribía la línea (y todo su histórico).
   */
  private async verificarAltaLibre<T extends ObjectLiteral & { id: string; codigo: string }>(
    repo: Repository<T>,
    id: string,
    codigo: string,
    articulo: string,
  ): Promise<void> {
    const [porCodigo, porId] = await Promise.all([
      repo.findOne({ where: { codigo } as never }),
      repo.findOne({ where: { id } as never }),
    ]);
    if (porCodigo || porId) {
      throw new ConflictoException(`Ya existe ${articulo} con ese código`, { codigo, id });
    }
  }

  /** INSERT puro (nunca upsert): una carrera entre dos altas da 409, no una sobrescritura. */
  private async insertar<T extends ObjectLiteral>(
    repo: Repository<T>,
    entidad: T,
    mensaje: string,
    codigo: string,
  ): Promise<void> {
    try {
      await insertarCopia(repo, entidad);
    } catch (error) {
      if (esClaveDuplicada(error)) throw new ConflictoException(mensaje, { codigo });
      throw error;
    }
  }

  /**
   * Guarda con concurrencia optimista: si el cliente envía `versionLeida` y no
   * coincide con la vigente → 409. El UPDATE es condicional sobre la versión
   * leída, así que dos guardados simultáneos no se pisan.
   */
  private async guardarConVersion<T extends ObjectLiteral & { id: string; version: number }>(
    repo: Repository<T>,
    entidad: T,
    versionLeida?: number,
  ): Promise<void> {
    const vigente = entidad.version ?? 1;
    if (versionLeida !== undefined && versionLeida !== vigente) {
      throw new ConflictoException(MENSAJE_CONFLICTO_VERSION, {
        version: vigente,
        versionEnviada: versionLeida,
      });
    }
    const columnas = new Set(repo.metadata.columns.map((c) => c.propertyName));
    const cambios = Object.fromEntries(
      Object.entries(entidad).filter(([k]) => columnas.has(k) && k !== 'id'),
    );
    cambios.version = vigente + 1;
    const resultado = await repo.update({ id: entidad.id, version: vigente } as never, cambios as never);
    if (resultado.affected === 0) {
      throw new ConflictoException(MENSAJE_CONFLICTO_VERSION, { version: vigente });
    }
    (entidad as { version: number }).version = vigente + 1;
  }
}

/** Nodo de causa con versión (parada o merma). */
type NodoVersionado = {
  id: string;
  codigo: string;
  parentId: string | null;
  estado: EstadoCatalogo;
  version: number;
};

/**
 * `PartialType` marca todo `@IsOptional`, que deja pasar `null`: en columnas
 * NOT NULL eso acababa en 500 al guardar. Aquí `null` explícito es un 422.
 */
function rechazarNulos(dto: object, campos: readonly string[]): void {
  const nulos = campos.filter((c) => (dto as Record<string, unknown>)[c] === null);
  if (nulos.length > 0) {
    throw new ValidationException(Object.fromEntries(nulos.map((c) => [c, 'Este campo no puede ser nulo'])));
  }
}

/** 422 si `nuevo` viene y difiere de `actual` (campos inmutables tras el alta). */
function verificarInmutable(
  campo: string,
  actual: string,
  nuevo: string | undefined,
  mensaje: string,
): void {
  if (nuevo !== undefined && nuevo !== actual) throw new ValidationException({ [campo]: mensaje });
}

/** 404 con el mensaje completo (`Línea no encontrada`, no «Línea no encontrado»). */
class RecursoNoEncontradoException extends HttpException {
  constructor(message: string) {
    super({ code: 'NOT_FOUND', message }, HttpStatus.NOT_FOUND);
  }
}
