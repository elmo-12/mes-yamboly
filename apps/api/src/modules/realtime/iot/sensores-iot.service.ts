import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { instanteDePlanta } from '@mes/shared';
import { IotApiClient } from './iot-api.client';
import {
  calcularLecturaLinea,
  parsearMapeoLineas,
  resolverLineal,
  type ConteoOrdenIot,
  type EstadoLinealIot,
  type LecturaIotLinea,
  type LinealIot,
} from './sensores-iot.util';

/**
 * Presupuesto de peticiones al IoT (todas `GET`, limitadas por IP por
 * `READ_RATE_LIMIT_MAX`/`READ_RATE_LIMIT_WINDOW_MS`, 120/min por defecto):
 *
 * - catálogo `GET /api/lineales`                 → 1/min
 * - estado   `GET /api/lineales/estado`          → ≤ 12/min (TTL 5 s, = cadencia del SSE)
 * - conteo   `GET /api/lineales/:x/conteo`       → ≤ 6/min por línea con orden (TTL 10 s)
 *
 * Con 1 línea instrumentada ≤ 19/min y con 3 ≤ 31/min, da igual cuántas
 * pantallas estén abiertas: las cachés se comparten. Si el MES y otro
 * consumidor salen por la misma IP, comparten el límite del IoT.
 */
/** El catálogo de lineales cambia poco, pero un sensor recién asignado debe verse pronto. */
const TTL_CATALOGO_MS = 60_000;
const TTL_ESTADO_MS = 5_000;
/** El conteo de la orden cambia con cada unidad, pero 10 s bastan para un tablero (igual que el legado). */
const TTL_CONTEO_MS = 10_000;
/** Una lectura buena se sostiene este tiempo ante fallos sueltos; después se da por perdida. */
const LECTURA_OBSOLETA_MS = 30_000;
/** Tras un fallo no se reintenta antes de esto: el snapshot no debe esperar timeouts en cadena. */
const REINTENTO_TRAS_FALLO_MS = 10_000;
/**
 * `hasta` del conteo un minuto en el futuro: el IoT sólo usa el acumulado en
 * vivo si `hasta >= su ahora`, y así un reloj del MES algo atrasado no cae al
 * snapshot del minuto anterior.
 */
const MARGEN_HASTA_MS = 60_000;

interface ConteoCacheado {
  conteo: ConteoOrdenIot;
  /** Momento de la última respuesta buena. */
  leidoEn: number;
  expiraEn: number;
  /** Mayor total visto para la orden (con el mismo conjunto de sensores). */
  maximo: number;
  sinReferencia: string;
  retrocedio: boolean;
}

/**
 * Catálogo de reserva cuando el IoT no respondió nunca: las líneas listadas
 * explícitamente en `IOT_LINEAS` se dan por instrumentadas para que el tablero
 * diga «Sensores sin respuesta» en vez de «Sin sensores». En modo automático
 * (sin `IOT_LINEAS`) no se puede saber qué líneas tienen sensores.
 */
function catalogoSupuesto(
  lineas: readonly LineaParaIot[],
  mapeo: Map<string, string | null> | null,
): LinealIot[] {
  if (!mapeo) return [];
  return lineas
    .filter((l) => mapeo.has(l.id))
    .map((l, i) => ({
      id: -(i + 1),
      nombre: mapeo.get(l.id) ?? l.nombre.toUpperCase(),
      sensores: ['?'],
    }));
}

export interface LineaParaIot {
  id: string;
  nombre: string;
  /** Orden en curso de la línea (`inicio` en ISO local del MES), si la hay. */
  ordenEnCurso?: { id: string; inicio: string } | null;
}

/**
 * Sensores IoT de las líneas del tablero de Tiempo real. **Sólo lectura**: el
 * MES no escribe nada en el IoT (ver `IotApiClient`).
 *
 * - Catálogo de lineales: `GET /api/lineales`.
 * - Producido de la orden en curso: `GET /api/lineales/:lineal/conteo` en
 *   [inicio de la orden, ahora]; el IoT resta el último snapshot anterior al
 *   inicio (`log_eventos_produccion`, uno por minuto) del acumulado en vivo.
 * - Velocidad y sensores en línea: `GET /api/lineales/estado`, una llamada
 *   para todas las lineales.
 *
 * No hay temporizadores: tira de caché y sólo consulta al IoT mientras alguien
 * pide el tablero. Sin `IOT_API_URL` + `IOT_API_KEY` devuelve un mapa vacío y
 * el tablero se comporta como siempre (se avisa una vez en el log al arrancar).
 */
@Injectable()
export class SensoresIotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SensoresIotService.name);

  private catalogo: { lineales: LinealIot[]; expiraEn: number } | null = null;
  private catalogoReintentoEn = 0;

  private estadoVivo: EstadoLinealIot[] | null = null;
  private estadoVivoEn = 0;
  private estadoReintentoEn = 0;
  private estadoEnVuelo: Promise<void> | null = null;

  /** Clave `${ordenId}|${lineal}|${desde}`. */
  private readonly conteos = new Map<string, ConteoCacheado>();
  private readonly conteosEnVuelo = new Map<string, Promise<void>>();
  private readonly conteosReintentoEn = new Map<string, number>();

  constructor(private readonly cliente: IotApiClient) {}

  onApplicationBootstrap(): void {
    if (this.cliente.configurado()) {
      const lineas = this.cliente.lineasConfiguradas();
      this.logger.log(
        `Sensores IoT activos (${lineas ? `líneas: ${lineas}` : 'todas las líneas con lineal homónima'})`,
      );
    } else {
      this.logger.log(
        'IOT_API_URL/IOT_API_KEY no definidas: el tablero de Tiempo real no lee sensores IoT',
      );
    }
  }

  activo(): boolean {
    return this.cliente.configurado();
  }

  /**
   * Lectura IoT de las líneas instrumentadas, por `lineaId`. Las líneas sin
   * lineal con sensores no aparecen en el mapa.
   */
  async lecturas(lineas: readonly LineaParaIot[]): Promise<Map<string, LecturaIotLinea>> {
    const resultado = new Map<string, LecturaIotLinea>();
    if (!this.activo() || lineas.length === 0) return resultado;

    const mapeo = parsearMapeoLineas(this.cliente.lineasConfiguradas());
    const catalogo = (await this.obtenerCatalogo()) ?? catalogoSupuesto(lineas, mapeo);
    if (catalogo.length === 0) return resultado;

    const instrumentadas = lineas
      .map((linea) => ({ linea, lineal: resolverLineal(linea, mapeo, catalogo) }))
      .filter((x): x is { linea: LineaParaIot; lineal: string } => x.lineal !== null);
    if (instrumentadas.length === 0) return resultado;

    await Promise.all([
      this.refrescarEstado(),
      ...instrumentadas.map(({ linea, lineal }) =>
        linea.ordenEnCurso ? this.refrescarConteo(linea.ordenEnCurso, lineal) : Promise.resolve(),
      ),
    ]);

    const ahoraMs = Date.now();
    const consultado =
      this.estadoVivo !== null && ahoraMs - this.estadoVivoEn < LECTURA_OBSOLETA_MS;
    const porNombre = new Map((this.estadoVivo ?? []).map((l) => [l.nombre, l]));

    for (const { linea, lineal } of instrumentadas) {
      const orden = linea.ordenEnCurso ?? null;
      const cacheado = orden ? this.conteos.get(this.claveConteo(orden, lineal)) : undefined;
      const vigente = cacheado && ahoraMs - cacheado.leidoEn < LECTURA_OBSOLETA_MS;
      resultado.set(
        linea.id,
        calcularLecturaLinea({
          lineal,
          vivo: porNombre.get(lineal),
          consultado,
          conOrden: orden !== null,
          conteo: vigente ? cacheado.conteo : undefined,
          retrocedio: vigente ? cacheado.retrocedio : false,
          ahoraMs,
        }),
      );
    }
    this.podarConteos(lineas);
    return resultado;
  }

  /** `null` si nunca se pudo leer el catálogo (IoT caído desde el arranque). */
  private async obtenerCatalogo(): Promise<LinealIot[] | null> {
    const ahora = Date.now();
    if (this.catalogo && this.catalogo.expiraEn > ahora) return this.catalogo.lineales;
    if (ahora < this.catalogoReintentoEn) return this.catalogo?.lineales ?? null;

    const lineales = await this.cliente.lineales();
    if (lineales === null) {
      /* El fallo no se cachea como catálogo vacío: se conserva el último bueno. */
      this.catalogoReintentoEn = ahora + REINTENTO_TRAS_FALLO_MS;
      return this.catalogo?.lineales ?? null;
    }
    this.catalogo = { lineales, expiraEn: ahora + TTL_CATALOGO_MS };
    return lineales;
  }

  private refrescarEstado(): Promise<void> {
    const ahora = Date.now();
    if (this.estadoVivo && ahora - this.estadoVivoEn < TTL_ESTADO_MS) return Promise.resolve();
    if (ahora < this.estadoReintentoEn) return Promise.resolve();
    if (this.estadoEnVuelo) return this.estadoEnVuelo;

    this.estadoEnVuelo = this.cliente
      .estado()
      .then((estado) => {
        if (estado === null) {
          this.estadoReintentoEn = Date.now() + REINTENTO_TRAS_FALLO_MS;
          return;
        }
        this.estadoVivo = estado;
        this.estadoVivoEn = Date.now();
      })
      .finally(() => {
        this.estadoEnVuelo = null;
      });
    return this.estadoEnVuelo;
  }

  /** La clave incluye el inicio: si se corrige la hora de arranque, el conteo se rehace. */
  private claveConteo(orden: { id: string; inicio: string }, lineal: string): string {
    return `${orden.id}|${lineal}|${orden.inicio}`;
  }

  /** Conteo de la orden en [inicio, ahora], con caché de `TTL_CONTEO_MS`. */
  private refrescarConteo(orden: { id: string; inicio: string }, lineal: string): Promise<void> {
    const clave = this.claveConteo(orden, lineal);
    const ahora = Date.now();
    if ((this.conteos.get(clave)?.expiraEn ?? 0) > ahora) return Promise.resolve();
    if (ahora < (this.conteosReintentoEn.get(clave) ?? 0)) return Promise.resolve();
    const enVuelo = this.conteosEnVuelo.get(clave);
    if (enVuelo) return enVuelo;

    /* Las marcas del MES son hora de pared de Lima sin zona: se convierten a
     * UTC como America/Lima de forma explícita. `new Date(orden.inicio)` las
     * leería en la TZ del proceso, y el despliegue fija `TZ=UTC` (+5 h). */
    const desde = instanteDePlanta(orden.inicio);
    if (!desde) return Promise.resolve();
    const hasta = new Date(Math.max(ahora, desde.getTime()) + MARGEN_HASTA_MS);

    const promesa = this.cliente
      .conteo(lineal, desde.toISOString(), hasta.toISOString())
      .then((conteo) => {
        if (conteo === null) {
          this.conteosReintentoEn.set(clave, Date.now() + REINTENTO_TRAS_FALLO_MS);
          return;
        }
        this.conteosReintentoEn.delete(clave);
        const previo = this.conteos.get(clave);
        const sinReferencia = [...conteo.sinReferencia].sort().join(',');
        const comparable = previo !== undefined && previo.sinReferencia === sinReferencia;
        const total = conteo.total;
        /* Regla del legado: un contador que retrocede invalida el conteo. El
         * IoT recorta cada sensor a 0, así que la bajada del total es la huella. */
        const retrocedio =
          comparable && total !== null && (previo.retrocedio || total < previo.maximo);
        const momento = Date.now();
        this.conteos.set(clave, {
          conteo,
          leidoEn: momento,
          expiraEn: momento + TTL_CONTEO_MS,
          maximo: Math.max(comparable ? previo.maximo : 0, total ?? 0),
          sinReferencia,
          retrocedio,
        });
      })
      .finally(() => {
        this.conteosEnVuelo.delete(clave);
      });
    this.conteosEnVuelo.set(clave, promesa);
    return promesa;
  }

  /** Se descartan los conteos de órdenes que ya no están en curso. */
  private podarConteos(lineas: readonly LineaParaIot[]): void {
    if (this.conteos.size <= 32) return;
    const vigentes = new Set(lineas.map((l) => l.ordenEnCurso?.id).filter(Boolean));
    for (const clave of this.conteos.keys()) {
      if (!vigentes.has(clave.split('|')[0])) this.conteos.delete(clave);
    }
    this.conteosReintentoEn.clear();
  }
}
