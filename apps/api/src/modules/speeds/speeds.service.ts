import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Paginated, RegistroVelocidadListItem } from '@mes/types';
import { calcDesvioVelocidad } from '@mes/shared';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import { enriquecerVelocidad } from '../../common/mappers/enrich';
import { LookupsService } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { ahoraIso, toList } from '../../common/utils/query';
import { RegistroVelocidad } from '../../database/entities';
import { OrdersService } from '../orders/orders.service';
import type { CreateVelocidadDto, VelocidadQueryDto } from './dto/velocidad.dto';

@Injectable()
export class SpeedsService {
  constructor(
    @InjectRepository(RegistroVelocidad)
    private readonly velocidades: Repository<RegistroVelocidad>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
  ) {}

  async listar(query: VelocidadQueryDto): Promise<Paginated<RegistroVelocidadListItem>> {
    const lookups = await this.lookups.load();
    const lineaIds = toList(query.lineaId);

    let items = await this.velocidades.find();
    if (query.ordenId) items = items.filter((v) => v.ordenId === query.ordenId);
    if (lineaIds.length > 0) items = items.filter((v) => lineaIds.includes(v.lineaId));
    items.sort((a, b) => b.registradaEn.localeCompare(a.registradaEn));

    return paginate(
      items.map((v) => enriquecerVelocidad(v, lookups)),
      query.page,
      query.pageSize,
    );
  }

  /**
   * El desvío se calcula contra la velocidad estándar **congelada en la orden**
   * (u/min del par producto × línea); si la orden es anterior a la migración se
   * recurre al par vigente. Nunca se toma del producto: ya no la tiene.
   */
  async crear(dto: CreateVelocidadDto, usuario: AuthUser): Promise<RegistroVelocidadListItem> {
    const orden = await this.orders.buscar(dto.ordenId);
    const lookups = await this.lookups.load();
    const velocidadEstandar =
      orden.velocidadEstandar ||
      (LookupsService.parActivo(lookups, orden.productoId, orden.lineaId)?.velocidadUnidMin ?? 0);

    const registradaEn = ahoraIso();
    const total = await this.velocidades.count();
    const registro = this.velocidades.create({
      id: `VEL-${orden.id.slice(4)}-N${total + 1}`,
      ordenId: orden.id,
      lineaId: dto.lineaId,
      registradaEn,
      velocidadReal: dto.velocidadReal,
      velocidadEstandar,
      desvioPct: calcDesvioVelocidad(dto.velocidadReal, velocidadEstandar),
      motivo: dto.motivo ?? null,
      responsableId: dto.responsableId,
      tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
    });
    await this.velocidades.save(registro);

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'velocidad',
      usuario,
      fecha: registradaEn,
      texto: `${usuario.nombre} registró velocidad real ${registro.velocidadReal} u/min (estándar ${velocidadEstandar} · ${registro.desvioPct} %)`,
    });

    this.emitirTri({
      tipo: 'velocidad',
      segundos: registro.tiempoRegistroSeg,
      usuarioId: usuario.id,
      fecha: registradaEn.slice(0, 10),
      referenciaId: registro.id,
      descripcion: `Velocidad ${registro.velocidadReal} u/min`,
    });

    return enriquecerVelocidad(registro, lookups);
  }

  private emitirTri(evento: TriRegistroEvent): void {
    this.events.emit(TRI_REGISTRO_EVENT, evento);
  }
}
