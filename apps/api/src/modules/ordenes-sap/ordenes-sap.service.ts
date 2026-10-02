import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Like, Repository } from 'typeorm';
import type { OrdenSapListItem, SincronizacionOrdenesSap } from '@mes/types';
import type { EnvVars } from '../../config/env.validation';
import { LookupsService, type Lookups } from '../../common/mappers/lookups.service';
import { ahoraIso, normalizar } from '../../common/utils/query';
import { OrdenSap } from '../../database/entities';
import type { OrdenSapQueryDto } from './dto/orden-sap-query.dto';
import {
  PREFIJO_ORDEN_SAP,
  type FilaSapOrigen,
  conOrigenSoloLectura,
  idOrdenSap,
  leerOrdenesSapPendientes,
  normalizarNombreLinea,
  turnoDesdeSap,
  velocidadSapUnidHora,
} from './origen-sap';
import { resolverVelocidadSap } from './velocidad-sap';

/** Tamaño de lote de los `DELETE … IN (…)` de la limpieza de pendientes. */
const TAMANO_LOTE = 500;

/**
 * Órdenes SAP: lectura del plan que llega de SAP (vía el sistema legado) y su
 * consumo al iniciar una orden de fabricación.
 *
 * La sincronización corre en un intervalo **sólo si** la API tiene
 * `ORIGEN_DATABASE_URL`; sin ella el job queda desactivado (se avisa una vez
 * en el log) y `POST /ordenes-sap/sincronizar` responde 503. Nunca se lee el
 * `.env` de yamboli-back desde la API: esa comodidad es exclusiva del script
 * `pnpm sync:real`, que se lanza a mano.
 */
@Injectable()
export class OrdenesSapService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrdenesSapService.name);
  private temporizador: NodeJS.Timeout | null = null;
  /** Sincronización en vuelo: una segunda petición se cuelga de la misma. */
  private enCurso: Promise<SincronizacionOrdenesSap> | null = null;

  constructor(
    @InjectRepository(OrdenSap) private readonly ordenesSap: Repository<OrdenSap>,
    private readonly lookups: LookupsService,
    private readonly config: ConfigService<EnvVars, true>,
  ) {}

  private urlOrigen(): string | null {
    return this.config.get('ORIGEN_DATABASE_URL', { infer: true })?.trim() || null;
  }

  /* ------------------------------------------------------------------ */
  /* Job periódico                                                      */
  /* ------------------------------------------------------------------ */

  onApplicationBootstrap(): void {
    /* Igual que la inferencia: nada de temporizadores vivos en los e2e. */
    if (process.env.NODE_ENV === 'test') return;
    if (!this.urlOrigen()) {
      this.logger.log(
        'ORIGEN_DATABASE_URL no definida: la sincronización de órdenes SAP queda desactivada',
      );
      return;
    }
    const minutos = Number(this.config.get('ORDENES_SAP_INTERVALO_MIN', { infer: true })) || 5;
    const ciclo = () => {
      this.sincronizar()
        .then((r) =>
          this.logger.log(
            `Órdenes SAP: ${r.leidas} pendientes · +${r.insertadas} · ~${r.actualizadas} · −${r.eliminadas}`,
          ),
        )
        .catch((error: unknown) =>
          this.logger.error(`Sincronización de órdenes SAP fallida: ${(error as Error).message}`),
        );
    };
    this.temporizador = setInterval(ciclo, minutos * 60_000);
    this.temporizador.unref();
    /* Primera pasada al arrancar, sin bloquear el arranque. */
    setTimeout(ciclo, 2_000).unref();
    this.logger.log(`Sincronización de órdenes SAP activa cada ${minutos} min`);
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  /* ------------------------------------------------------------------ */
  /* Lectura                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Pendientes seleccionables: sin orden del MES y con producto mapeado,
   * por fecha ascendente y turno (como el wizard legado).
   */
  async listar(query: OrdenSapQueryDto): Promise<{ data: OrdenSapListItem[] }> {
    const filas = await this.ordenesSap.find({
      where: {
        ordenId: IsNull(),
        ...(query.lineaId ? { lineaId: query.lineaId } : {}),
      },
    });
    const q = normalizar(query.q?.trim() ?? '');
    const lookups = await this.lookups.load();
    const data = filas
      .filter((f) => f.productoId !== null)
      .filter(
        (f) =>
          !q ||
          normalizar(f.numero).includes(q) ||
          normalizar(f.codigoProducto).includes(q) ||
          normalizar(f.productoNombre).includes(q),
      )
      .sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          a.turno.localeCompare(b.turno) ||
          a.numero.localeCompare(b.numero) ||
          a.id.localeCompare(b.id),
      )
      .map((f) => enriquecerOrdenSap(f, lookups));
    return { data };
  }

  /* ------------------------------------------------------------------ */
  /* Sincronización                                                     */
  /* ------------------------------------------------------------------ */

  /** Lee el origen y aplica sus pendientes. 503 si no hay origen configurado. */
  async sincronizar(): Promise<SincronizacionOrdenesSap> {
    const url = this.urlOrigen();
    if (!url) {
      throw new HttpException(
        {
          code: 'ORIGEN_NO_CONFIGURADO',
          message:
            'La sincronización con SAP no está configurada en este servidor (falta ORIGEN_DATABASE_URL)',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (this.enCurso) return this.enCurso;
    this.enCurso = (async () => {
      try {
        const filas = await conOrigenSoloLectura(url, leerOrdenesSapPendientes);
        return await this.aplicar(filas);
      } finally {
        this.enCurso = null;
      }
    })();
    return this.enCurso;
  }

  /**
   * Aplica al MES el conjunto **completo** de pendientes del origen:
   *
   *  - inserta las filas nuevas y refresca las conocidas, **sin pisar nunca**
   *    `ordenId`: si el MES ya consumió la fila, sigue consumida aunque el
   *    origen todavía la vea libre;
   *  - borra las pendientes del MES (`SAP-…` sin `ordenId`) que ya no vienen:
   *    desaparecieron del origen, se consumieron allí o salieron de la ventana
   *    `fecha >= ayer`. Las de demostración (`SAPD-…`) no se tocan.
   *
   * Separada de `sincronizar` para poder probarla sin un origen real.
   */
  async aplicar(filas: FilaSapOrigen[]): Promise<SincronizacionOrdenesSap> {
    const sincronizadaEn = ahoraIso();
    const lookups = await this.lookups.load();
    const lineasPorNombre = new Map(
      [...lookups.lineas.values()].map((l) => [normalizarNombreLinea(l.nombre), l.id]),
    );
    const productosPorCodigo = new Map(
      [...lookups.productos.values()].map((p) => [p.codigo, p.id]),
    );

    const resultado: SincronizacionOrdenesSap = {
      leidas: filas.length,
      insertadas: 0,
      actualizadas: 0,
      eliminadas: 0,
      omitidas: 0,
      sinProducto: 0,
      sincronizadaEn,
    };

    await this.ordenesSap.manager.transaction(async (gestor) => {
      const repo = gestor.getRepository(OrdenSap);
      const vigentes = new Set<string>();
      const nuevas: OrdenSap[] = [];
      const ids = filas.map((f) => idOrdenSap(f.sapId));
      const existentes = new Map<string, OrdenSap>();
      for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
        for (const fila of await repo.find({ where: { id: In(ids.slice(i, i + TAMANO_LOTE)) } })) {
          existentes.set(fila.id, fila);
        }
      }

      for (const fila of filas) {
        const lineaId = lineasPorNombre.get(normalizarNombreLinea(fila.lineaProduccion));
        if (!lineaId) {
          resultado.omitidas += 1;
          continue;
        }
        const id = idOrdenSap(fila.sapId);
        vigentes.add(id);
        const productoId = (fila.codigoProducto && productosPorCodigo.get(fila.codigoProducto)) || null;
        if (!productoId) resultado.sinProducto += 1;
        const datos = {
          numero: fila.numero,
          fecha: fila.fecha,
          turno: turnoDesdeSap(fila.turno),
          lineaId,
          productoId,
          codigoProducto: fila.codigoProducto ?? '',
          productoNombre: fila.producto ?? '',
          planificadoCajas: fila.planificadoCajas,
          velocidadUnidHora: velocidadSapUnidHora(fila.velocidadEstandarTexto),
          tipoProduccion: fila.tipoProduccion,
          sincronizadaEn,
        } satisfies Partial<OrdenSap>;

        const existente = existentes.get(id);
        if (existente) {
          /* `update` sólo con las columnas del origen: `ordenId` queda intacto. */
          await repo.update({ id }, datos);
          resultado.actualizadas += 1;
        } else {
          nuevas.push(repo.create({ id, ...datos, ordenId: null }));
        }
      }
      if (nuevas.length > 0) await repo.save(nuevas, { chunk: 100 });
      resultado.insertadas = nuevas.length;

      const pendientes = await repo.find({
        select: { id: true },
        where: { ordenId: IsNull(), id: Like(`${PREFIJO_ORDEN_SAP}%`) },
      });
      const sobrantes = pendientes.map((p) => p.id).filter((id) => !vigentes.has(id));
      for (let i = 0; i < sobrantes.length; i += TAMANO_LOTE) {
        await repo.delete({ id: In(sobrantes.slice(i, i + TAMANO_LOTE)), ordenId: IsNull() });
      }
      resultado.eliminadas = sobrantes.length;
    });

    return resultado;
  }
}

/** Fila del selector: línea, unidades y velocidad con la que nacería la orden. */
export function enriquecerOrdenSap(fila: OrdenSap, lookups: Lookups): OrdenSapListItem {
  const linea = lookups.lineas.get(fila.lineaId);
  const producto = fila.productoId ? lookups.productos.get(fila.productoId) : undefined;
  const unidadesPorCaja = producto && producto.unidadesPorCaja > 0 ? producto.unidadesPorCaja : 1;
  const velocidad = resolverVelocidadSap(lookups, fila);
  return {
    id: fila.id,
    numero: fila.numero,
    fecha: fila.fecha,
    turno: fila.turno,
    lineaId: fila.lineaId,
    productoId: fila.productoId,
    codigoProducto: fila.codigoProducto,
    productoNombre: fila.productoNombre || producto?.nombre || '—',
    planificadoCajas: fila.planificadoCajas,
    velocidadUnidHora: fila.velocidadUnidHora,
    tipoProduccion: fila.tipoProduccion,
    ordenId: fila.ordenId,
    sincronizadaEn: fila.sincronizadaEn,
    lineaCodigo: linea?.codigo ?? '—',
    lineaNombre: linea?.nombre ?? '—',
    unidadesPorCaja,
    planificadoUnidades: fila.planificadoCajas * unidadesPorCaja,
    velocidadEstandar: velocidad?.velocidadUnidMin ?? null,
    velocidadFuente: velocidad?.fuente ?? null,
  };
}
