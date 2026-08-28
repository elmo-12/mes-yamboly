import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MermaListItem, Paginated } from '@mes/types';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import { NoEncontradoException, ValidationException } from '../../common/exceptions/business.exception';
import { enriquecerMerma } from '../../common/mappers/enrich';
import { LookupsService } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { ahoraIso, toList } from '../../common/utils/query';
import { Merma } from '../../database/entities';
import { OrdersService } from '../orders/orders.service';
import type { CreateMermaDto, MermaQueryDto, UpdateMermaDto } from './dto/merma.dto';

@Injectable()
export class ScrapService {
  constructor(
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
  ) {}

  async listar(query: MermaQueryDto): Promise<Paginated<MermaListItem>> {
    const lookups = await this.lookups.load();
    const lineaIds = toList(query.lineaId);
    const tipos = toList(query.tipo);
    const causaIds = toList(query.causaId);

    let items = await this.mermas.find();
    if (query.ordenId) items = items.filter((m) => m.ordenId === query.ordenId);
    if (lineaIds.length > 0) items = items.filter((m) => lineaIds.includes(m.lineaId));
    if (tipos.length > 0) items = items.filter((m) => tipos.includes(m.tipo));
    if (causaIds.length > 0) items = items.filter((m) => causaIds.includes(m.causaId));
    if (query.desde) items = items.filter((m) => m.registradaEn.slice(0, 10) >= query.desde!);
    if (query.hasta) items = items.filter((m) => m.registradaEn.slice(0, 10) <= query.hasta!);

    items.sort((a, b) => b.registradaEn.localeCompare(a.registradaEn));
    return paginate(
      items.map((m) => enriquecerMerma(m, lookups)),
      query.page,
      query.pageSize,
    );
  }

  async crear(dto: CreateMermaDto, usuario: AuthUser): Promise<MermaListItem> {
    const lookups = await this.lookups.load();
    const causa = lookups.causasMerma.get(dto.causaId);
    if (!causa) throw new ValidationException({ causaId: 'La causa seleccionada no existe' });
    if (!causa.aplicaA.includes(dto.tipo)) {
      throw new ValidationException({
        causaId: `La causa ${causa.codigo} no aplica a mermas de tipo ${dto.tipo}`,
      });
    }
    const orden = await this.orders.buscar(dto.ordenId);

    const registradaEn = ahoraIso();
    const total = await this.mermas.count();
    const merma = this.mermas.create({
      id: `MER-${orden.id.slice(4)}-N${total + 1}`,
      ordenId: orden.id,
      lineaId: dto.lineaId,
      tipo: dto.tipo,
      cantidadKg: dto.cantidadKg,
      sabor: dto.sabor,
      causaId: causa.id,
      responsableId: dto.responsableId,
      codigoBalde: dto.codigoBalde ?? null,
      enviarPasteurizacion: dto.enviarPasteurizacion ?? false,
      registradaEn,
      tiempoRegistroSeg: dto.tiempoRegistroSeg ?? 0,
      observacion: dto.observacion ?? null,
    });
    await this.mermas.save(merma);
    await this.actualizarOrden(orden.id);

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'merma',
      usuario,
      fecha: registradaEn,
      texto: `${usuario.nombre} registró merma ${merma.tipo} ${merma.cantidadKg} kg · ${causa.codigo} ${causa.nombre}`,
    });

    this.emitirTri({
      tipo: 'merma',
      segundos: merma.tiempoRegistroSeg,
      usuarioId: usuario.id,
      fecha: registradaEn.slice(0, 10),
      referenciaId: merma.id,
      descripcion: `Merma ${merma.tipo} ${merma.cantidadKg} kg`,
    });

    return enriquecerMerma(merma, await this.lookups.load());
  }

  async actualizar(id: string, dto: UpdateMermaDto, usuario: AuthUser): Promise<MermaListItem> {
    const merma = await this.mermas.findOne({ where: { id } });
    if (!merma) throw new NoEncontradoException('Merma');
    const lookups = await this.lookups.load();

    if (dto.causaId && !lookups.causasMerma.has(dto.causaId)) {
      throw new ValidationException({ causaId: 'La causa seleccionada no existe' });
    }
    if (dto.cantidadKg !== undefined && dto.cantidadKg <= 0) {
      throw new ValidationException({ cantidadKg: 'La cantidad debe ser mayor que 0' });
    }

    const anterior = { tipo: merma.tipo, cantidadKg: merma.cantidadKg, causaId: merma.causaId };
    Object.assign(merma, {
      ...dto,
      codigoBalde: dto.codigoBalde ?? merma.codigoBalde,
      observacion: dto.observacion ?? merma.observacion,
    });
    await this.mermas.save(merma);
    await this.actualizarOrden(merma.ordenId);

    await this.audit.registrar({
      ordenId: merma.ordenId,
      tipo: 'edicion',
      usuario,
      texto: `${usuario.nombre} editó la merma ${merma.id}: ${anterior.tipo} ${anterior.cantidadKg} kg → ${merma.tipo} ${merma.cantidadKg} kg`,
    });

    return enriquecerMerma(merma, await this.lookups.load());
  }

  private async actualizarOrden(ordenId: string): Promise<void> {
    const orden = await this.orders.buscar(ordenId);
    await this.orders.recalcular(orden);
    await this.orders.guardar(orden);
  }

  private emitirTri(evento: TriRegistroEvent): void {
    this.events.emit(TRI_REGISTRO_EVENT, evento);
  }
}
