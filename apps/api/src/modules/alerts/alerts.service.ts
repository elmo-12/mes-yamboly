import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import { calcEp } from '@mes/shared';
import type {
  Alerta as AlertaDto,
  AlertasResumen,
  EstadoAlerta,
  Paginated,
  Umbrales as UmbralesDtoType,
} from '@mes/types';
import { MENSAJE_CONFLICTO_VERSION, TIPO_ALERTA_LABEL } from '@mes/types';
import { assertAccesoLinea } from '../../common/auth';
import type { AuthUser } from '../../common/decorators';
import {
  ConflictoException,
  NoEncontradoException,
  ValidationException,
} from '../../common/exceptions';
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

/** Quien actúa sobre la alerta: rol y línea para el control de acceso. */
type Actor = Pick<AuthUser, 'nombre' | 'rol' | 'lineaId'>;

/**
 * Máquina de estados de la alerta (A3), validada en el servidor:
 *
 * - `activa` → `atendida` (atender) | `descartada` (descartar)
 * - `atendida` | `vencida` → `confirmada` (confirmar el evento real, Anexo 06)
 * - `activa` → `confirmada` solo si su ventana ya cerró (el motor aún no la venció)
 * - `descartada` y `confirmada` son finales: no se reabren ni cuentan en la EP
 *   si no se confirmaron.
 */
export const TRANSICIONES = {
  atender: ['activa'],
  descartar: ['activa'],
  confirmar: ['activa', 'atendida', 'vencida'],
} as const satisfies Record<string, readonly EstadoAlerta[]>;

type Accion = keyof typeof TRANSICIONES;

const VERBO: Record<Accion, string> = {
  atender: 'atender',
  descartar: 'descartar',
  confirmar: 'confirmar',
};

/** `null` si la transición es válida; si no, el motivo en español. */
export function motivoTransicionInvalida(
  alerta: Pick<Alerta, 'estado' | 'ventanaFin'>,
  accion: Accion,
  ahora: string = ahoraIso(),
): string | null {
  const desde = TRANSICIONES[accion] as readonly EstadoAlerta[];
  if (!desde.includes(alerta.estado)) {
    return `No se puede ${VERBO[accion]} una alerta ${alerta.estado}`;
  }
  if (accion === 'confirmar' && alerta.estado === 'activa' && alerta.ventanaFin > ahora) {
    return 'No se puede confirmar todavía: la ventana de la predicción sigue abierta';
  }
  return null;
}

function exigirTransicion(alerta: Alerta, accion: Accion): void {
  const motivo = motivoTransicionInvalida(alerta, accion);
  if (motivo) {
    throw new ConflictoException(motivo, { estado: alerta.estado });
  }
}

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
      .filter(
        (a) =>
          !query.pendientes ||
          (a.acierto === null && (a.estado === 'atendida' || a.estado === 'vencida')),
      )
      .filter((a) => !query.desde || a.generadaEn.slice(0, 10) >= query.desde)
      .filter((a) => !query.hasta || a.generadaEn.slice(0, 10) <= query.hasta)
      .filter(
        (a) => !busqueda || normalizar(`${a.prediccion} ${a.lineaNombre}`).includes(busqueda),
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
      /* Ya se actuó sobre ellas (atendida o vencida) pero falta confirmar el evento real.
       * Las descartadas no cuentan: no admiten confirmación (mismo criterio que
       * `esperaConfirmacion` en la web, M1). */
      pendientesConfirmar: filas.filter(
        (a) => a.acierto === null && (a.estado === 'atendida' || a.estado === 'vencida'),
      ).length,
      vencidas: filas.filter((a) => a.estado === 'vencida').length,
      epAcumulada: await this.epPorcentaje(),
      epConfirmadas: await this.registrosEp.count(),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Mutaciones                                                        */
  /* ---------------------------------------------------------------- */

  async atender(id: string, dto: AtenderAlertaDto, usuario: Actor): Promise<ResultadoMutacion> {
    const alerta = await this.buscar(id);
    assertAccesoLinea(usuario, alerta.lineaId);
    exigirTransicion(alerta, 'atender');
    await this.transicionar(this.alertas.manager, alerta.id, TRANSICIONES.atender, {
      estado: 'atendida',
      accionTomada: dto.accionTomada.trim(),
      atendidaPor: usuario.nombre,
      atendidaEn: ahoraIso(),
    });
    return { alerta: aAlertaDto(await this.buscar(id)), resumen: await this.resumen() };
  }

  async descartar(id: string, dto: DescartarAlertaDto, usuario: Actor): Promise<ResultadoMutacion> {
    const alerta = await this.buscar(id);
    assertAccesoLinea(usuario, alerta.lineaId);
    exigirTransicion(alerta, 'descartar');
    await this.transicionar(this.alertas.manager, alerta.id, TRANSICIONES.descartar, {
      estado: 'descartada',
      observacion: dto.motivo.trim(),
      atendidaPor: usuario.nombre,
      atendidaEn: ahoraIso(),
    });
    return { alerta: aAlertaDto(await this.buscar(id)), resumen: await this.resumen() };
  }

  async confirmar(id: string, dto: ConfirmarEventoDto): Promise<ResultadoConfirmacion> {
    await this.enSerie(() =>
      this.alertas.manager.transaction(async (manager) => {
        const alerta = await manager.findOne(Alerta, { where: { id } });
        if (!alerta) throw new NoEncontradoException('Alerta', true);
        exigirTransicion(alerta, 'confirmar');
        await this.aplicarConfirmacion(manager, alerta, dto);
      }),
    );
    return {
      alerta: aAlertaDto(await this.buscar(id)),
      resumen: await this.resumen(),
      ep: await this.epPorcentaje(),
    };
  }

  /**
   * Lote atómico: o se confirman todas o ninguna. Antes las inválidas se
   * saltaban en silencio (200 con `data: []`) y un doble envío reventaba con
   * 500 al insertar dos veces la misma fila del Anexo 06.
   */
  async confirmarLote(dto: ConfirmarLoteDto): Promise<{
    data: AlertaDto[];
    resumen: AlertasResumen;
    ep: number;
  }> {
    const ids = dto.confirmaciones.map((c) => c.alertaId);
    const repetidas = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repetidas.length) {
      throw new ValidationException({
        confirmaciones: `Alertas repetidas en el lote: ${[...new Set(repetidas)].join(', ')}`,
      });
    }
    await this.enSerie(() =>
      this.alertas.manager.transaction(async (manager) => {
        const filas = await manager.find(Alerta, { where: { id: In(ids) } });
        const porId = new Map(filas.map((a) => [a.id, a]));
        const inexistentes = ids.filter((id) => !porId.has(id));
        if (inexistentes.length) {
          throw new NoEncontradoException(`Alerta ${inexistentes.join(', ')}`, true);
        }
        const invalidas = filas.filter((a) => motivoTransicionInvalida(a, 'confirmar') !== null);
        if (invalidas.length) {
          throw new ConflictoException('Algunas alertas no admiten confirmación', {
            alertas: invalidas
              .map((a) => `${a.id}: ${motivoTransicionInvalida(a, 'confirmar')}`)
              .join(' · '),
          });
        }
        for (const item of dto.confirmaciones) {
          await this.aplicarConfirmacion(manager, porId.get(item.alertaId)!, item);
        }
      }),
    );
    const actualizadas = await this.alertas.find({ where: { id: In(ids) } });
    return {
      data: actualizadas.map(aAlertaDto),
      resumen: await this.resumen(),
      ep: await this.epPorcentaje(),
    };
  }

  /**
   * Fija el acierto, cierra la alerta y añade la fila del Anexo 06. El cambio
   * de estado es condicional (`WHERE estado IN …`): si dos peticiones llegan a
   * la vez, solo una lo consigue y la otra recibe 409, nunca un 500.
   */
  private async aplicarConfirmacion(
    manager: EntityManager,
    alerta: Alerta,
    dto: ConfirmarEventoDto,
  ): Promise<void> {
    const observacion = dto.observacion?.trim() || undefined;
    await this.transicionar(manager, alerta.id, TRANSICIONES.confirmar, {
      acierto: dto.ocurrio,
      estado: 'confirmada',
      ...(observacion ? { observacion } : {}),
    });

    const ultimo = await manager
      .createQueryBuilder(RegistroEp, 'r')
      .select('MAX(r.n)', 'max')
      .getRawOne<{ max: number | null }>();
    await manager.insert(RegistroEp, {
      id: `EP-ALE-${alerta.id}`,
      n: Number(ultimo?.max ?? 0) + 1,
      fecha: hoyIso(),
      tipoPrediccion: `${TIPO_ALERTA_LABEL[alerta.tipo]} · ${alerta.lineaCodigo} ${alerta.lineaNombre}`,
      eventoReal: dto.ocurrio
        ? 'El evento ocurrió dentro de la ventana prevista'
        : 'No se observó el evento en la ventana',
      acierto: dto.ocurrio,
      observacion: observacion ?? '',
      alertaId: alerta.id,
    });
  }

  /**
   * Las confirmaciones escriben el Anexo 06 dentro de una transacción. Se
   * encadenan en este proceso para que dos envíos simultáneos no abran
   * transacciones a la vez (SQLite comparte una sola conexión); entre
   * instancias, el UPDATE condicionado de `transicionar` sigue garantizando
   * que solo una gane.
   */
  private cola: Promise<unknown> = Promise.resolve();
  private enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(tarea, tarea);
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }

  /** UPDATE condicionado al estado de origen; 0 filas = otra petición ganó → 409. */
  private async transicionar(
    manager: EntityManager,
    id: string,
    desde: readonly EstadoAlerta[],
    cambios: Partial<Alerta>,
  ): Promise<void> {
    const resultado = await manager
      .createQueryBuilder()
      .update(Alerta)
      .set(cambios as never)
      .where('id = :id', { id })
      .andWhere('estado IN (:...desde)', { desde: [...desde] })
      .execute();
    if (!resultado.affected) {
      throw new ConflictoException(
        'La alerta cambió de estado mientras la editabas; recarga la bandeja',
      );
    }
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
    /* Concurrencia optimista: si el cliente envía la versión que leyó y otra
     * persona guardó después, 409 en vez de pisar sus cambios en silencio. */
    const { version: versionLeida, ...resto } = dto;
    const vigente = fila.version ?? 1;
    if (versionLeida !== undefined && fila.actualizadoEn && versionLeida !== vigente) {
      throw new ConflictoException(MENSAJE_CONFLICTO_VERSION, {
        version: vigente,
        versionEnviada: versionLeida,
      });
    }
    /* Las tolerancias TCI son opcionales: si no vienen, se conservan las vigentes. */
    const cambios = Object.fromEntries(
      Object.entries(resto).filter(([, valor]) => valor !== undefined),
    );
    Object.assign(fila, cambios, { actualizadoEn: ahoraIso(), actualizadoPor: usuario });
    if (!fila.version) {
      fila.version = 1;
      await this.umbrales.save(fila);
      return this.aUmbralesDto(fila);
    }
    const { id: _id, ...columnas } = fila;
    const resultado = await this.umbrales.update(
      { id: UMBRALES_ID, version: vigente },
      { ...columnas, version: vigente + 1 },
    );
    if (resultado.affected === 0) {
      throw new ConflictoException(MENSAJE_CONFLICTO_VERSION, { version: vigente });
    }
    fila.version = vigente + 1;
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
      version: fila.version ?? 1,
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
    if (!alerta) throw new NoEncontradoException('Alerta', true);
    return alerta;
  }
}
