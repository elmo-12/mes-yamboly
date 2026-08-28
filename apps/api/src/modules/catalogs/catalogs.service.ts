import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CausaMerma as CausaMermaDto,
  CausaParada as CausaParadaDto,
  CausaParadaNodo,
  Linea as LineaDto,
  Maquina as MaquinaDto,
  Producto as ProductoDto,
  TipoMermaCodigo,
  TurnoDef,
} from '@mes/types';
import { ConflictoException, NoEncontradoException } from '../../common/exceptions/business.exception';
import { toList } from '../../common/utils/query';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Maquina,
  Parada,
  Producto,
  Turno,
} from '../../database/entities';
import type { CreateCausaParadaDto, UpdateCausaParadaDto } from './dto/causa-parada.dto';
import type { CreateMaquinaDto, UpdateMaquinaDto } from './dto/maquina.dto';
import type { UpdateProductoDto } from './dto/producto.dto';

/** Reconstruye el árbol Tipo → General → Específica a partir de `parentId`. */
function construirArbol(causas: CausaParadaDto[]): CausaParadaNodo[] {
  const nodos = new Map<string, CausaParadaNodo>();
  for (const c of causas) nodos.set(c.id, { ...c, hijos: [] });
  const raices: CausaParadaNodo[] = [];
  for (const nodo of nodos.values()) {
    if (nodo.parentId) nodos.get(nodo.parentId)?.hijos.push(nodo);
    else raices.push(nodo);
  }
  return raices;
}

@Injectable()
export class CatalogsService {
  constructor(
    @InjectRepository(Turno) private readonly turnos: Repository<Turno>,
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
    @InjectRepository(Maquina) private readonly maquinas: Repository<Maquina>,
    @InjectRepository(CausaParada) private readonly causasParada: Repository<CausaParada>,
    @InjectRepository(CausaMerma) private readonly causasMerma: Repository<CausaMerma>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
  ) {}

  listarTurnos(): Promise<TurnoDef[]> {
    return this.turnos.find({ order: { id: 'ASC' } });
  }

  async listarLineas(sedeId?: string): Promise<LineaDto[]> {
    const filas = await this.lineas.find({ order: { id: 'ASC' } });
    return sedeId ? filas.filter((l) => l.sedeId === sedeId) : filas;
  }

  async listarProductos(lineaId?: string): Promise<ProductoDto[]> {
    const filas = await this.productos.find({ order: { id: 'ASC' } });
    return lineaId ? filas.filter((p) => p.lineaId === lineaId) : filas;
  }

  /** Configuración → Productos y velocidades (spec 10.C). */
  async actualizarProducto(id: string, dto: UpdateProductoDto): Promise<ProductoDto> {
    const producto = await this.productos.findOne({ where: { id } });
    if (!producto) throw new NoEncontradoException('Producto');
    if (dto.velocidadEstandar !== undefined) producto.velocidadEstandar = dto.velocidadEstandar;
    if (dto.estado !== undefined) producto.estado = dto.estado;
    return this.productos.save(producto);
  }

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
    return construirArbol(causas);
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
   * Baja lógica (spec 10.D): la causa nunca se borra; se marca `inactivo` y se
   * informa cuántas paradas históricas conservan el código.
   */
  async darDeBajaCausaParada(id: string) {
    const causa = await this.causasParada.findOne({ where: { id } });
    if (!causa) throw new NoEncontradoException('Causa de parada');
    const enUso = (await this.paradas.count({ where: { causaId: id } })) + causa.paradasHistoricas;
    causa.estado = 'inactivo';
    await this.causasParada.save(causa);
    return {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo' as const,
      paradasConservadas: enUso,
      mensaje: `Hay ${enUso} paradas históricas con esta causa; se conservarán con el código ${causa.codigo}.`,
    };
  }

  async listarCausasMerma(tipo?: string): Promise<CausaMermaDto[]> {
    const filas = await this.causasMerma.find({ order: { codigo: 'ASC' } });
    return tipo ? filas.filter((c) => c.aplicaA.includes(tipo as TipoMermaCodigo)) : filas;
  }
}
