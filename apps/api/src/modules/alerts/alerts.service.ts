import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { calcEp } from '@mes/shared';
import type {
  Alerta as AlertaDto,
  AlertasResumen,
  Paginated,
  Umbrales as UmbralesDtoType,
} from '@mes/types';
import { TIPO_ALERTA_LABEL } from '@mes/types';
import { ConflictoException, NoEncontradoException } from '../../common/exceptions';
import { ahoraIso, diaOperativo, hoyIso, normalizar, paginate, toList } from '../../common/utils';
import { Alerta, RegistroEp, Umbrales } from '../../database/entities';
import { aAlertaDto } from './alerts.mapper';
import type { AlertaQueryDto } from './dto/alerta-query.dto';
import type {
  AtenderAlertaDto,
  ConfirmarEventoDto,
  ConfirmarLoteDto,
  DescartarAlertaDto,
} from './dto/mutaciones.dto';
import type { UmbralesDto } from './dto/umbrales.dto';

/** Id del registro singleton de umbrales. */
const UMBRALES_ID = 'UMB-01';

export interface ResultadoMutacion {
  alerta: AlertaDto;
  resumen: AlertasResumen;
}

export interface ResultadoConfirmacion extends ResultadoMutacion {
  /** EP acumulada recalculada, en porcentaje (contrato: número, no objeto). */
  ep: number;
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
    @InjectRepository(Umbrales) private readonly umbrales: Repository<Umbrales>,
    @InjectRepository(RegistroEp) private readonly registrosEp: Repository<RegistroEp>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Consultas                                                         */
  /* ---------------------------------------------------------------- */

  async listar(query: AlertaQueryDto): Promise<Paginated<AlertaDto>> {
    const tipos = toList(query.tipo);
    const severidades = toList(query.severidad);
    const lineas = toList(query.lineaId);
    const estados = toList(query.estado);
    const busqueda = query.search ? normalizar(query.search) : '';

    const filas = (await this.alertas.find({ order: { generadaEn: 'DESC' } }))
      .filter((a) => !tipos.length || tipos.includes(a.tipo))
      .filter((a) => !severidades.length || severidades.includes(a.severidad))
      .filter((a) => !lineas.length || lineas.includes(a.lineaId))
      .filter((a) => !estados.length || estados.includes(a.estado))
      .filter((a) => !query.desde || a.generadaEn.slice(0, 10) >= query.desde)
      .filter((a) => !query.hasta || a.generadaEn.slice(0, 10) <= query.hasta)
      .filter(
        (a) =>
          !busqueda ||
          normalizar(`${a.prediccion} ${a.lineaNombre}`).includes(busqueda),
      );

    return paginate(filas.map(aAlertaDto), query.page, query.pageSize);
  }

  async recientes(limit = 3): Promise<AlertaDto[]> {
    const filas = await this.alertas.find({
      where: { estado: 'activa' },
      order: { generadaEn: 'DESC' },
      take: Math.max(1, Math.min(20, limit)),
    });
    return filas.map(aAlertaDto);
  }

  async detalle(id: string): Promise<AlertaDto> {
    return aAlertaDto(await this.buscar(id));
  }

  async resumen(): Promise<AlertasResumen> {
    const filas = await this.alertas.find();
    /* Mismo criterio de «día operativo» que el resto de módulos: con el juego de
     * datos congelado en `HOY`, comparar con el reloj real dejaba «Atendidas
     * hoy» en 0 aunque la bandeja mostrara 9 alertas atendidas ese día. */
    const hoy = diaOperativo(
      filas.map((a) => ({ fecha: (a.atendidaEn ?? a.generadaEn).slice(0, 10), estado: a.estado })),
    );
    return {
      activas: filas.filter((a) => a.estado === 'activa').length,
      atendidasHoy: filas.filter(
        (a) => a.estado === 'atendida' && (a.atendidaEn ?? '').slice(0, 10) === hoy,
      ).length,
      /* Ya se actuó sobre ellas (atendida o vencida) pero falta confirmar el evento real. */
      pendientesConfirmar: filas.filter((a) => a.acierto === null && a.estado !== 'activa').length,
      vencidas: filas.filter((a) => a.estado === 'vencida').length,
      epAcumulada: await this.epPorcentaje(),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Mutaciones                                                        */
  /* ---------------------------------------------------------------- */

  async atender(id: string, dto: AtenderAlertaDto, usuario: string): Promise<ResultadoMutacion> {
    const alerta = await this.buscar(id);
    if (alerta.estado === 'confirmada') {
      throw new ConflictoException('La alerta ya fue confirmada y no admite cambios');
    }
    alerta.estado = 'atendida';
    alerta.accionTomada = dto.accionTomada;
    alerta.atendidaPor = usuario;
    alerta.atendidaEn = ahoraIso();
    await this.alertas.save(alerta);
    return { alerta: aAlertaDto(alerta), resumen: await this.resumen() };
  }

  async descartar(id: string, dto: DescartarAlertaDto, usuario: string): Promise<ResultadoMutacion> {
    const alerta = await this.buscar(id);
    if (alerta.estado === 'confirmada') {
      throw new ConflictoException('La alerta ya fue confirmada y no admite cambios');
    }
    alerta.estado = 'descartada';
    alerta.observacion = dto.motivo;
    alerta.atendidaPor = usuario;
    alerta.atendidaEn = ahoraIso();
    await this.alertas.save(alerta);
    return { alerta: aAlertaDto(alerta), resumen: await this.resumen() };
  }

  async confirmar(id: string, dto: ConfirmarEventoDto): Promise<ResultadoConfirmacion> {
    const alerta = await this.buscar(id);
    if (alerta.estado === 'confirmada') {
      throw new ConflictoException('El evento real de esta alerta ya fue confirmado');
    }
    await this.aplicarConfirmacion(alerta, dto);
    return {
      alerta: aAlertaDto(alerta),
      resumen: await this.resumen(),
      ep: await this.epPorcentaje(),
    };
  }

  async confirmarLote(dto: ConfirmarLoteDto): Promise<{
    data: AlertaDto[];
    resumen: AlertasResumen;
    ep: number;
  }> {
    const actualizadas: AlertaDto[] = [];
    for (const item of dto.confirmaciones) {
      const alerta = await this.alertas.findOne({ where: { id: item.alertaId } });
      if (!alerta || alerta.estado === 'confirmada') continue;
      await this.aplicarConfirmacion(alerta, item);
      actualizadas.push(aAlertaDto(alerta));
    }
    return { data: actualizadas, resumen: await this.resumen(), ep: await this.epPorcentaje() };
  }

  /** Fija el acierto, cierra la alerta y añade la fila del Anexo 06. */
  private async aplicarConfirmacion(alerta: Alerta, dto: ConfirmarEventoDto): Promise<void> {
    alerta.acierto = dto.ocurrio;
    alerta.estado = 'confirmada';
    if (dto.observacion) alerta.observacion = dto.observacion;
    await this.alertas.save(alerta);

    const total = await this.registrosEp.count();
    await this.registrosEp.save(
      this.registrosEp.create({
        id: `EP-ALE-${alerta.id}`,
        n: total + 1,
        fecha: hoyIso(),
        tipoPrediccion: `${TIPO_ALERTA_LABEL[alerta.tipo]} · ${alerta.lineaCodigo} ${alerta.lineaNombre}`,
        eventoReal: dto.ocurrio
          ? 'El evento ocurrió dentro de la ventana prevista'
          : 'No se observó el evento en la ventana',
        acierto: dto.ocurrio,
        observacion: dto.observacion ?? '',
        alertaId: alerta.id,
      }),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Umbrales                                                          */
  /* ---------------------------------------------------------------- */

  async obtenerUmbrales(): Promise<UmbralesDtoType> {
    const fila = await this.umbrales.findOne({ where: { id: UMBRALES_ID } });
    if (!fila) throw new NoEncontradoException('Configuración de umbrales');
    return this.aUmbralesDto(fila);
  }

  async guardarUmbrales(dto: UmbralesDto, usuario: string): Promise<UmbralesDtoType> {
    const fila =
      (await this.umbrales.findOne({ where: { id: UMBRALES_ID } })) ??
      this.umbrales.create({ id: UMBRALES_ID });
    /* Las tolerancias TCI son opcionales: si no vienen, se conservan las vigentes. */
    const cambios = Object.fromEntries(
      Object.entries(dto).filter(([, valor]) => valor !== undefined),
    );
    Object.assign(fila, cambios, { actualizadoEn: ahoraIso(), actualizadoPor: usuario });
    await this.umbrales.save(fila);
    return this.aUmbralesDto(fila);
  }

  private aUmbralesDto(fila: Umbrales): UmbralesDtoType {
    return {
      velocidadBajoEstandarPct: fila.velocidadBajoEstandarPct,
      oeeMinimo: fila.oeeMinimo,
      probabilidadMinima: fila.probabilidadMinima,
      notificarN8n: fila.notificarN8n,
      mostrarTv: fila.mostrarTv,
      tciToleranciaMin: fila.tciToleranciaMin,
      tciToleranciaPct: fila.tciToleranciaPct,
      tciToleranciaDiasSap: fila.tciToleranciaDiasSap,
      actualizadoEn: fila.actualizadoEn,
      actualizadoPor: fila.actualizadoPor,
    };
  }

  /* ---------------------------------------------------------------- */
  /* KPI EP                                                            */
  /* ---------------------------------------------------------------- */

  /** EP = predicciones correctas / predicciones confirmadas × 100 (Anexo 06). */
  async ep(): Promise<{ porcentaje: number; correctas: number; totales: number }> {
    const totales = await this.registrosEp.count();
    const correctas = await this.registrosEp.countBy({ acierto: true });
    return { porcentaje: calcEp(correctas, totales), correctas, totales };
  }

  /** EP acumulada en porcentaje — la forma que consume el frontend. */
  private async epPorcentaje(): Promise<number> {
    return (await this.ep()).porcentaje;
  }

  private async buscar(id: string): Promise<Alerta> {
    const alerta = await this.alertas.findOne({ where: { id } });
    if (!alerta) throw new NoEncontradoException('Alerta');
    return alerta;
  }
}
