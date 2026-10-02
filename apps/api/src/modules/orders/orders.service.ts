import { ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Like, Repository } from 'typeorm';
import type {
  AuditEvent,
  Colaborador,
  MermaListItem,
  OrdenListItem,
  OrdenesResumen,
  Paginated,
  ParadaListItem,
  RegistroVelocidadListItem,
} from '@mes/types';
import {
  ahoraPlanta,
  duracionOrdenMin,
  fechaOperativaDe,
  MARGEN_PLAUSIBILIDAD_PRODUCCION,
  minutosEntreLocal,
  oeeDeOrden,
  produccionMaximaPlausible,
  rangoPeriodo,
  turnoDeInstante,
} from '@mes/shared';
import { esFechaReal } from '@mes/types';
import { assertAccesoLinea } from '../../common/auth/acceso-linea';
import type { AuthUser } from '../../common/decorators/current-user';
import { TRI_REGISTRO_EVENT, type TriRegistroEvent } from '../../common/events/tri.event';
import {
  ConflictoException,
  ValidationException,
} from '../../common/exceptions/business.exception';
import {
  enriquecerMerma,
  enriquecerOrden,
  enriquecerParada,
  enriquecerVelocidad,
} from '../../common/mappers/enrich';
import { LookupsService } from '../../common/mappers/lookups.service';
import { AuditService } from '../../common/services/audit.service';
import { paginate } from '../../common/utils/paginate';
import { esClaveDuplicada, insertarCopia } from '../../common/utils/ids';
import { diaOperativo, normalizar, redondear, toList } from '../../common/utils/query';
import {
  Merma,
  OrdenFabricacion,
  OrdenSap,
  Parada,
  RegistroVelocidad,
} from '../../database/entities';
import { colaboradoresBase } from '../../database/seeds/data/users';
import { AdjuntosService } from '../attachments/adjuntos.service';
import { resolverVelocidadSap } from '../ordenes-sap/velocidad-sap';
import type { CreateOrdenDto, FinalizeOrdenDto, ValidateOrdenDto } from './dto/orden-mutations.dto';
import type { OrdenQueryDto } from './dto/orden-query.dto';

/** Roles que pueden corregir (y recalcular) una orden ya cerrada. */
const ROLES_CORRECCION = new Set(['jefe', 'supervisor']);
/** Estados desde los que una orden se puede validar. */
type EstadoValidable = 'por_validar' | 'cerrada' | 'incompleta';
/** Reintentos del alta ante una colisión del código (mismo número SAP a la vez). */
const INTENTOS_ALTA = 5;
/** Mayor entero de una columna `integer` (int4) de Postgres. */
const INT4_MAX = 2_147_483_647;

/**
 * Código libre para una orden nacida del número SAP, con el mismo esquema que
 * `pnpm sync:real` (`scripts/sincronizacion/mapeo.ts`): la primera ejecución
 * de un número usa el número tal cual (`95101752`) y las siguientes —el mismo
 * número en otra fecha, turno o parcial— llevan sufijo `-2`, `-3`…; el id es
 * siempre `ORD-<código>`, así que tampoco colisiona entre años.
 */
async function codigoLibre(repo: Repository<OrdenFabricacion>, numero: string): Promise<string> {
  const usados = new Set(
    (
      await repo.find({
        select: { codigo: true },
        where: [{ codigo: numero }, { codigo: Like(`${numero}-%`) }],
      })
    ).map((o) => o.codigo),
  );
  if (!usados.has(numero)) return numero;
  let jornada = 2;
  while (usados.has(`${numero}-${jornada}`)) jornada += 1;
  return `${numero}-${jornada}`;
}

/** 404 `NOT_FOUND` con el género correcto («Orden SAP no encontrada»). */
function noEncontrada(recurso: string): HttpException {
  return new HttpException(
    { code: 'NOT_FOUND', message: `${recurso} no encontrada` },
    HttpStatus.NOT_FOUND,
  );
}

/** Orden traída por `pnpm sync:real`: `mapeo.ts` no asigna colaboradores y el alta del MES sí. */
function esImportadaDelLegado(orden: OrdenFabricacion): boolean {
  return (orden.colaboradores?.length ?? 0) === 0;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(RegistroVelocidad)
    private readonly velocidades: Repository<RegistroVelocidad>,
    @InjectRepository(OrdenSap) private readonly ordenesSap: Repository<OrdenSap>,
    private readonly lookups: LookupsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly adjuntos: AdjuntosService,
  ) {}

  /** Acepta id (`ORD-0815`) o código (`OF-2026-0815`). */
  async buscar(idOrCodigo: string): Promise<OrdenFabricacion> {
    const orden =
      (await this.ordenes.findOne({ where: { id: idOrCodigo } })) ??
      (await this.ordenes.findOne({ where: { codigo: idOrCodigo } }));
    if (!orden) throw noEncontrada('Orden de fabricación');
    return orden;
  }

  async listar(query: OrdenQueryDto): Promise<Paginated<OrdenListItem>> {
    const lookups = await this.lookups.load();
    const lineaIds = toList(query.lineaId);
    const turnos = toList(query.turno);
    const estados = toList(query.estado);
    const search = normalizar(query.search ?? '');

    let items = await this.ordenes.find();

    /* `hoy`/`semana`/`mes` se anclan al día operativo (la fecha de las órdenes
     * vigentes), no al reloj del servidor: con el juego de datos congelado en
     * una fecha fija, `?periodo=hoy` devolvía siempre una lista vacía. */
    let rango: { desde: string; hasta: string } | null = null;
    if (query.desde && query.hasta) rango = { desde: query.desde, hasta: query.hasta };
    else if (query.periodo && query.periodo !== 'personalizado') {
      rango = rangoPeriodo(query.periodo, diaOperativo(items));
    }

    if (rango) items = items.filter((o) => o.fecha >= rango.desde && o.fecha <= rango.hasta);
    if (lineaIds.length > 0) items = items.filter((o) => lineaIds.includes(o.lineaId));
    if (turnos.length > 0) items = items.filter((o) => turnos.includes(o.turno));
    if (estados.length > 0) items = items.filter((o) => estados.includes(o.estado));
    if (search) {
      items = items.filter((o) => {
        const producto = lookups.productos.get(o.productoId)?.nombre ?? '';
        return (
          normalizar(o.codigo).includes(search) ||
          normalizar(o.lote).includes(search) ||
          normalizar(producto).includes(search)
        );
      });
    }

    const sort = query.sort ?? 'fecha';
    const dir = query.orden === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      if (sort === 'oee') return (a.oee.oee - b.oee.oee) * dir;
      if (sort === 'producido') return (a.producido - b.producido) * dir;
      if (sort === 'codigo') return a.codigo.localeCompare(b.codigo) * dir;
      const porFecha =
        a.fecha === b.fecha ? a.codigo.localeCompare(b.codigo) : a.fecha.localeCompare(b.fecha);
      return porFecha * dir;
    });

    return paginate(
      items.map((o) => enriquecerOrden(o, lookups)),
      query.page,
      query.pageSize,
    );
  }

  async resumen(): Promise<OrdenesResumen> {
    const items = await this.ordenes.find();
    return {
      /* Spec 05.A: la card «Todas» cuenta el repositorio completo de órdenes. */
      todas: items.length,
      porValidar: items.filter((o) => o.estado === 'por_validar').length,
      conParadas: items.filter((o) => o.paradasCount > 0).length,
      conMermas: items.filter((o) => o.mermasKg > 0).length,
      ultimaSincronizacion: await this.ultimaSincronizacionSap(),
    };
  }

  /** Última sincronización real con SAP; `null` si nunca la hubo. */
  private async ultimaSincronizacionSap(): Promise<string | null> {
    const [ultima] = await this.ordenesSap.find({
      select: { id: true, sincronizadaEn: true },
      order: { sincronizadaEn: 'DESC' },
      take: 1,
    });
    return ultima?.sincronizadaEn ?? null;
  }

  async detalle(idOrCodigo: string): Promise<OrdenListItem> {
    const orden = await this.buscar(idOrCodigo);
    const sap = await this.ordenesSap.findOne({ where: { ordenId: orden.id } });
    return {
      ...enriquecerOrden(orden, await this.lookups.load()),
      planSap: sap
        ? {
            ordenSapId: sap.id,
            numero: sap.numero,
            fecha: sap.fecha,
            turno: sap.turno,
            planificadoCajas: sap.planificadoCajas,
          }
        : null,
    };
  }

  /**
   * Inicia una orden de fabricación a partir de una orden SAP pendiente, como el
   * wizard del sistema legado. De la fila SAP salen línea, producto, número
   * (= número SAP), planificado y velocidad; el turno y la fecha operativa son
   * los de la hora real de inicio (hora de planta, America/Lima). El formulario
   * sólo aporta lote, vencimiento y equipo.
   *
   * Reglas: 404 si la fila no existe · 409 si ya la consumió otra orden o si la
   * línea ya tiene una orden en curso · 422 en `ordenSapId` si el producto no
   * está en el maestro, no hay velocidad estándar o el planificado se desborda;
   * 422 en el campo del equipo si las personas no existen o no tienen el rol.
   */
  async crear(dto: CreateOrdenDto, usuario: AuthUser): Promise<OrdenListItem> {
    const sap = await this.ordenesSap.findOne({ where: { id: dto.ordenSapId } });
    if (!sap) throw noEncontrada('Orden SAP');
    if (sap.ordenId) {
      throw new ConflictoException('La orden SAP ya fue iniciada', {
        ordenSapId: sap.id,
        ordenId: sap.ordenId,
      });
    }

    const lookups = await this.lookups.load();
    const producto = sap.productoId ? lookups.productos.get(sap.productoId) : undefined;
    if (!producto) {
      throw new ValidationException({
        ordenSapId: `El producto ${sap.codigoProducto || '—'} no existe en el maestro del MES`,
      });
    }

    /*
     * La velocidad estándar se congela en u/min: la del par producto × línea
     * activo y, si no lo hay, la que fijó SAP para la orden. Sin ninguna, la
     * orden no puede iniciarse: el OEE quedaría sin referencia de desempeño.
     */
    const velocidad = resolverVelocidadSap(lookups, sap);
    if (!velocidad) {
      throw new ValidationException({
        ordenSapId: 'El producto no tiene velocidad estándar en esta línea ni en la orden SAP',
      });
    }

    const lineaSap = lookups.lineas.get(sap.lineaId);
    if (lineaSap && lineaSap.estado !== 'activo') {
      throw new ValidationException({
        ordenSapId: `La línea ${lineaSap.codigo} está desactivada: no se pueden iniciar órdenes en ella`,
      });
    }

    /* SAP planifica en cajas; el MES guarda unidades (columna int4). */
    const unidadesPorCaja = producto.unidadesPorCaja > 0 ? producto.unidadesPorCaja : 1;
    const planificado = sap.planificadoCajas * unidadesPorCaja;
    if (!Number.isSafeInteger(planificado) || planificado < 0 || planificado > INT4_MAX) {
      throw new ValidationException({
        ordenSapId: `El planificado de la orden SAP (${sap.planificadoCajas} cajas) está fuera de rango`,
      });
    }

    /* Las validaciones de negocio se adelantan a las FKs: 422 en vez de 500. */
    const inicio = ahoraPlanta();
    const errores: Record<string, string> = {};
    if (!esFechaReal(dto.vencimiento)) errores.vencimiento = 'Fecha inválida';
    else if (dto.vencimiento <= inicio.slice(0, 10)) {
      errores.vencimiento = 'El vencimiento debe ser posterior a hoy';
    }
    const maquinista = lookups.usuarios.get(dto.maquinistaId);
    if (!maquinista) errores.maquinistaId = 'El maquinista indicado no existe';
    else if (maquinista.rol !== 'maquinista') {
      errores.maquinistaId = `${maquinista.nombre} no tiene rol de maquinista`;
    } else if (maquinista.activo === false) {
      errores.maquinistaId = `${maquinista.nombre} está desactivado`;
    }
    const supervisor = lookups.usuarios.get(dto.supervisorId);
    if (!supervisor) errores.supervisorId = 'El supervisor indicado no existe';
    else if (!ROLES_CORRECCION.has(supervisor.rol)) {
      errores.supervisorId = `${supervisor.nombre} no es supervisor ni jefe de producción`;
    } else if (supervisor.activo === false) {
      errores.supervisorId = `${supervisor.nombre} está desactivado`;
    }
    const colaboradorIds = [...new Set(dto.colaboradorIds ?? [])];
    const desconocidos = colaboradorIds.filter((id) => !colaboradoresBase.some((c) => c.id === id));
    if (desconocidos.length > 0) {
      errores.colaboradorIds = `Colaboradores inexistentes: ${desconocidos.join(', ')}`;
    }
    if (Object.keys(errores).length > 0) throw new ValidationException(errores);

    const colaboradores: Colaborador[] =
      colaboradorIds.length > 0
        ? colaboradoresBase.filter((c) => colaboradorIds.includes(c.id))
        : colaboradoresBase.slice(0, 4);

    const datos = {
      fecha: fechaOperativaDe(inicio),
      lineaId: sap.lineaId,
      productoId: producto.id,
      turno: turnoDeInstante(inicio),
      lote: dto.lote,
      vencimiento: dto.vencimiento,
      planificado,
      producido: 0,
      conteoCodificadora: 0,
      velocidadEstandar: velocidad.velocidadUnidMin,
      velocidadEstandarId: velocidad.velocidadEstandarId,
      estado: 'en_curso' as const,
      maquinistaId: dto.maquinistaId,
      supervisorId: dto.supervisorId,
      operarios: dto.operarios,
      colaboradores,
      oee: { oee: 0, disponibilidad: 0, desempeno: 0, calidad: 0 },
      paradasCount: 0,
      mermasKg: 0,
      inicio,
      fin: null,
      observacion: null,
    };

    /*
     * Alta en una transacción: cerrojo sobre la línea (Postgres), una sola
     * orden en curso por línea, código libre y consumo de la fila SAP con un
     * `UPDATE … WHERE ordenId IS NULL`. Si dos altas del mismo número SAP
     * calculan a la vez el mismo código, la segunda choca con la clave única y
     * se reintenta con el sufijo siguiente.
     */
    let orden: OrdenFabricacion | null = null;
    for (let intento = 1; !orden; intento++) {
      try {
        orden = await this.enSerie(() =>
          this.ordenes.manager.transaction(async (gestor) => {
            if (gestor.connection.options.type === 'postgres') {
              await gestor.query('SELECT id FROM linea WHERE id = $1 FOR UPDATE', [sap.lineaId]);
            }
            const repoOrdenes = gestor.getRepository(OrdenFabricacion);
            const abierta = await repoOrdenes.findOne({
              where: { lineaId: sap.lineaId, estado: 'en_curso' },
            });
            if (abierta) {
              const linea = lookups.lineas.get(sap.lineaId);
              throw new ConflictoException(
                `La línea ${linea?.codigo ?? sap.lineaId} ya tiene la orden ${abierta.codigo} en curso: ` +
                  'finalízala antes de iniciar otra',
                { lineaId: sap.lineaId, ordenId: abierta.id },
              );
            }
            const codigo = await codigoLibre(repoOrdenes, sap.numero);
            const nueva = repoOrdenes.create({ id: `ORD-${codigo}`, codigo, ...datos });
            await insertarCopia(repoOrdenes, nueva);

            const marcada = await gestor
              .getRepository(OrdenSap)
              .update({ id: sap.id, ordenId: IsNull() }, { ordenId: nueva.id });
            if (marcada.affected !== 1) {
              /* Otra alta la consumió entre la lectura y este punto: se revierte todo. */
              throw new ConflictoException('La orden SAP ya fue iniciada', { ordenSapId: sap.id });
            }
            return nueva;
          }),
        );
      } catch (error) {
        if (!esClaveDuplicada(error) || intento >= INTENTOS_ALTA) throw error;
      }
    }

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'creacion',
      usuario,
      fecha: inicio,
      texto:
        `${usuario.nombre} creó la orden ${orden.codigo} desde la orden SAP ${sap.numero} ` +
        `(plan ${sap.fecha} · turno ${sap.turno}) · ${producto.nombre} · ` +
        `${sap.planificadoCajas} cajas = ${orden.planificado} unidades`,
    });

    /* El cronómetro del wizard de inicio también alimenta el postest del TRI. */
    this.emitirTri({
      tipo: 'orden',
      segundos: dto.tiempoRegistroSeg ?? 0,
      usuarioId: usuario.id,
      fecha: orden.fecha,
      referenciaId: `${orden.id}-inicio`,
      descripcion: `Inicio de ${orden.codigo}`,
    });

    return this.detalle(orden.id);
  }

  /**
   * Cierra la orden y la deja «Por validar». Idempotente y sin carrera: el
   * cambio de estado es un `UPDATE … WHERE estado = 'en_curso'`; el segundo
   * envío (doble clic, dos pestañas) recibe 409 y no duplica bitácora ni TRI.
   *
   * 403 si un maquinista intenta cerrar una orden de otra línea · 409 con una
   * parada abierta · 422 en `producido` si supera lo físicamente posible
   * (`velocidad estándar × duración × MARGEN_PLAUSIBILIDAD_PRODUCCION`).
   */
  async finalizar(
    idOrCodigo: string,
    dto: FinalizeOrdenDto,
    usuario: AuthUser,
  ): Promise<OrdenListItem> {
    const orden = await this.buscar(idOrCodigo);
    assertAccesoLinea(usuario, orden.lineaId);
    if (orden.estado !== 'en_curso') {
      throw new ConflictoException('La orden ya fue finalizada', { estado: orden.estado });
    }
    await this.exigirSinParadasAbiertas(orden, 'finalizar');

    const fin = ahoraPlanta();
    const duracionMin = minutosEntreLocal(orden.inicio, fin);
    if (orden.velocidadEstandar > 0) {
      const maximo = produccionMaximaPlausible(orden.velocidadEstandar, duracionMin);
      if (dto.producido > maximo) {
        throw new ValidationException({
          producido:
            `${dto.producido} u no es posible en ${Math.max(1, Math.round(duracionMin))} min a ` +
            `${orden.velocidadEstandar} u/min (máximo ${maximo} u con un margen de ` +
            `×${String(MARGEN_PLAUSIBILIDAD_PRODUCCION).replace('.', ',')})`,
        });
      }
    }

    orden.producido = dto.producido;
    orden.conteoCodificadora = dto.conteoCodificadora;
    orden.fin = fin;
    orden.estado = 'por_validar';
    if (dto.comentario) orden.observacion = dto.comentario;
    /* La foto de la etiqueta ya viene subida (`POST /evidencias`); aquí sólo se
     * guarda su ruta. */
    if (dto.evidenciaUrl) {
      await this.adjuntos.validarVinculo(dto.evidenciaUrl, { usuarioId: usuario.id });
      orden.evidenciaUrl = dto.evidenciaUrl;
    }
    await this.aplicarRecalculo(orden);

    const cambio = await this.ordenes.update(
      { id: orden.id, estado: 'en_curso' },
      {
        producido: orden.producido,
        conteoCodificadora: orden.conteoCodificadora,
        fin: orden.fin,
        estado: orden.estado,
        observacion: orden.observacion,
        evidenciaUrl: orden.evidenciaUrl ?? null,
        oee: orden.oee,
        paradasCount: orden.paradasCount,
        mermasKg: orden.mermasKg,
      },
    );
    if (cambio.affected !== 1) {
      throw new ConflictoException('La orden ya fue finalizada', { estado: 'por_validar' });
    }

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'sistema',
      usuario,
      fecha: fin,
      texto: `${usuario.nombre} finalizó la orden con ${orden.producido} unidades (conteo codificadora ${orden.conteoCodificadora})`,
    });

    this.emitirTri({
      tipo: 'orden',
      segundos: dto.tiempoRegistroSeg ?? 0,
      usuarioId: usuario.id,
      fecha: fechaOperativaDe(fin),
      referenciaId: `${orden.id}-cierre`,
      descripcion: `Cierre de ${orden.codigo}`,
    });

    return this.detalle(orden.id);
  }

  /**
   * Valida y sella la orden. Sin carrera: `UPDATE … WHERE estado = <el leído>`;
   * el segundo envío recibe 409 y no duplica la bitácora. 409 también con una
   * parada abierta.
   */
  async validar(
    idOrCodigo: string,
    dto: ValidateOrdenDto,
    usuario: AuthUser,
  ): Promise<OrdenListItem> {
    const orden = await this.buscar(idOrCodigo);
    if (orden.estado === 'validada') {
      throw new ConflictoException('La orden ya está validada', { estado: orden.estado });
    }
    if (orden.estado === 'en_curso') {
      throw new ConflictoException('No se puede validar una orden en curso', {
        estado: orden.estado,
      });
    }
    await this.exigirSinParadasAbiertas(orden, 'validar');

    const estadoLeido = orden.estado as EstadoValidable;
    /* Validar sólo sella el estado: conserva el OEE vigente (el del cierre o el
     * de la última corrección). Recalcular aquí reescribía el OEE de las órdenes
     * importadas del legado (sin conteo de codificadora quedaba en 0). */
    if (dto.observacion) orden.observacion = dto.observacion;

    const cambio = await this.ordenes.update(
      { id: orden.id, estado: estadoLeido },
      {
        estado: 'validada',
        observacion: orden.observacion,
        oee: orden.oee,
        paradasCount: orden.paradasCount,
        mermasKg: orden.mermasKg,
      },
    );
    if (cambio.affected !== 1) {
      throw new ConflictoException('La orden ya está validada', { estado: 'validada' });
    }

    await this.audit.registrar({
      ordenId: orden.id,
      tipo: 'validacion',
      usuario,
      texto: `${usuario.nombre} validó y cerró la orden${dto.observacion ? ` · ${dto.observacion}` : ''}`,
    });

    return this.detalle(orden.id);
  }

  /**
   * Serializa las altas dentro de este proceso. En Postgres el cerrojo de la
   * línea y la clave única ya bastan entre instancias; esto además evita que
   * SQLite (una sola conexión: demo y e2e) intente transacciones anidadas.
   */
  private colaAltas: Promise<unknown> = Promise.resolve();
  private enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.colaAltas.then(tarea, tarea);
    this.colaAltas = resultado.catch(() => undefined);
    return resultado;
  }

  /** 409 si la orden tiene alguna parada sin hora de fin. */
  private async exigirSinParadasAbiertas(
    orden: OrdenFabricacion,
    accion: 'finalizar' | 'validar',
  ): Promise<void> {
    const abierta = await this.paradas.findOne({ where: { ordenId: orden.id, fin: IsNull() } });
    if (abierta) {
      throw new ConflictoException(`Cierra la parada abierta antes de ${accion}`, {
        paradaId: abierta.id,
      });
    }
  }

  async paradasDe(idOrCodigo: string) {
    const orden = await this.buscar(idOrCodigo);
    const lookups = await this.lookups.load();
    const filas = (await this.paradas.find({ where: { ordenId: orden.id } })).sort((a, b) =>
      a.inicio.localeCompare(b.inicio),
    );
    const data: ParadaListItem[] = filas.map((p) => enriquecerParada(p, lookups));
    return {
      data,
      resumen: {
        cantidad: data.length,
        minutos: data.reduce((acc, p) => acc + p.duracionMin, 0),
        afectanOee: data.filter((p) => p.afectaOee).length,
      },
    };
  }

  async mermasDe(idOrCodigo: string) {
    const orden = await this.buscar(idOrCodigo);
    const lookups = await this.lookups.load();
    const filas = (await this.mermas.find({ where: { ordenId: orden.id } })).sort((a, b) =>
      a.registradaEn.localeCompare(b.registradaEn),
    );
    const data: MermaListItem[] = filas.map((m) => enriquecerMerma(m, lookups));
    return {
      data,
      resumen: {
        cantidad: data.length,
        kg: redondear(
          data.reduce((acc, m) => acc + m.cantidadKg, 0),
          2,
        ),
      },
    };
  }

  async velocidadesDe(idOrCodigo: string): Promise<{ data: RegistroVelocidadListItem[] }> {
    const orden = await this.buscar(idOrCodigo);
    const lookups = await this.lookups.load();
    const filas = (await this.velocidades.find({ where: { ordenId: orden.id } })).sort((a, b) =>
      a.registradaEn.localeCompare(b.registradaEn),
    );
    return { data: filas.map((v) => enriquecerVelocidad(v, lookups)) };
  }

  async bitacoraDe(idOrCodigo: string, tipo?: string | string[]): Promise<{ data: AuditEvent[] }> {
    const orden = await this.buscar(idOrCodigo);
    return { data: await this.audit.porOrden(orden.id, toList(tipo)) };
  }

  /**
   * Recalcula OEE, nº de paradas y kg de merma a partir de los registros vivos.
   *
   * Una orden **validada** está sellada: nunca se reescribe. Una orden cerrada
   * pendiente de validar (`por_validar`, `cerrada`, `incompleta`) sólo se
   * recalcula cuando corrige un jefe o supervisor. Sin `usuario` (llamada
   * interna) se trata como corrección del sistema y sólo se respeta el sello de
   * la validada. Devuelve `true` si aplicó el recálculo.
   *
   * Fórmula: `oeeDeOrden` de `@mes/shared` con la duración real de la orden
   * como tiempo planificado (la misma que el estimado del modal de cierre).
   */
  async recalcular(orden: OrdenFabricacion, usuario?: Pick<AuthUser, 'rol'>): Promise<boolean> {
    if (orden.estado === 'validada') return false;
    if (orden.estado !== 'en_curso' && usuario && !ROLES_CORRECCION.has(usuario.rol)) {
      return false;
    }
    await this.aplicarRecalculo(orden, esImportadaDelLegado(orden) && orden.estado !== 'en_curso');
    return true;
  }

  /** Como {@link recalcular} pero lanzando 403 si el usuario no puede corregir la orden. */
  async exigirCorreccion(orden: OrdenFabricacion, usuario: Pick<AuthUser, 'rol'>): Promise<void> {
    if (orden.estado === 'validada') {
      throw new ConflictoException('La orden está validada: no admite correcciones', {
        estado: orden.estado,
      });
    }
    if (orden.estado !== 'en_curso' && !ROLES_CORRECCION.has(usuario.rol)) {
      throw new ForbiddenException(
        'Sólo un supervisor o el jefe de producción pueden corregir una orden cerrada',
      );
    }
  }

  private async aplicarRecalculo(
    orden: OrdenFabricacion,
    conservarOee = false,
  ): Promise<void> {
    const [paradas, mermas] = await Promise.all([
      this.paradas.find({ where: { ordenId: orden.id } }),
      this.mermas.find({ where: { ordenId: orden.id } }),
    ]);
    const paradasMin = paradas
      .filter((p) => p.afectaOee)
      .reduce((acc, p) => acc + p.duracionMin, 0);

    orden.paradasCount = paradas.length;
    orden.mermasKg = redondear(mermas.reduce((acc, m) => acc + m.cantidadKg, 0));
    /* Orden importada del legado (cerrada): su OEE lo calculó el motor del legado
     * con datos que el MES no guarda (kg de merma pesados, conteos, paradas
     * propias). Recalcularlo con la fórmula del MES lo reescribía (calidad a 100,
     * disponibilidad y desempeño distintos aun con una parada que no afecta OEE) y
     * no se puede reconstruir «sólo el efecto de lo corregido» sin guardar el
     * estado previo. Regla conservadora: el OEE importado se congela y las
     * correcciones sólo actualizan `paradasCount` y `mermasKg`. Se reconoce por
     * `colaboradores` vacío: `mapeo.ts` no los asigna y el alta del MES siempre
     * asigna al menos uno. */
    if (conservarOee) return;
    const pesoKg = (await this.lookups.load()).productos.get(orden.productoId)?.pesoKg ?? 0;
    orden.oee = oeeDeOrden({
      /* Merma en unidades: sólo se deriva con el peso del producto. */
      mermaUnidades: pesoKg > 0 ? Math.round(orden.mermasKg / pesoKg) : undefined,
      duracionMin: duracionOrdenMin(orden, ahoraPlanta()),
      paradasMin,
      producido: orden.producido,
      conteoCodificadora: orden.conteoCodificadora,
      velocidadEstandar: orden.velocidadEstandar,
    });
  }

  /** Persiste la orden tras un recálculo disparado por otro módulo. */
  async guardar(orden: OrdenFabricacion): Promise<OrdenFabricacion> {
    return this.ordenes.save(orden);
  }

  /** Orden `en_curso` más reciente de una línea; `null` si la línea está libre. */
  async enCursoDeLinea(lineaId: string): Promise<OrdenFabricacion | null> {
    const abiertas = await this.ordenes.find({ where: { lineaId, estado: 'en_curso' } });
    return abiertas.sort((a, b) => b.inicio.localeCompare(a.inicio))[0] ?? null;
  }

  emitirTri(evento: TriRegistroEvent): void {
    this.events.emit(TRI_REGISTRO_EVENT, evento);
  }
}
