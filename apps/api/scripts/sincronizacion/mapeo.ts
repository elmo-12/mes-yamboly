/**
 * Traducción del modelo del sistema real al modelo del MES.
 *
 * La regla de oro de la sincronización es **usar sólo la información que el MES
 * ya guarda**: el sistema real tiene muchas más columnas (overrun, pesos,
 * checklists, almacenes, colaboradores por puesto…) que aquí se descartan. Lo
 * que se conserva es lo que alimenta las vistas del MES: órdenes, paradas,
 * mermas y lecturas de velocidad.
 *
 * Resolución de catálogos (por este orden, y siempre sin inventar códigos):
 *  - **Línea**: por nombre normalizado contra las 9 líneas del maestro del MES.
 *    Las líneas del origen que no existen en el MES (p. ej. `MIXPLANT 2`, la
 *    planta de pasteurización) se descartan y se reportan.
 *  - **Producto**: por código de 7 dígitos (`PRD-<codigo>`). Si el producto no
 *    está en el maestro del MES se da de alta con la ficha real.
 *  - **Causas de parada y de merma**: por el **id de la numeración del maestro**
 *    (`idLegado` en `seeds/data/real/causas-*.json`), que es el que guardan las
 *    tablas puente del origen. Es un punto delicado y verificado a mano: la
 *    tabla `parada_categoria_especificas` se renumeró en algún momento, de modo
 *    que unir `paradas_categoria_especifica_lnk.categoria_especifica_id` contra
 *    los ids **vigentes** de esa tabla devuelve causas equivocadas (una parada
 *    de 12:00 a 13:00 comentada «Refrigerio» salía como «Falla Operativa»). El
 *    `idLegado` del maestro sí reproduce exactamente lo que muestra el sistema
 *    real, y además distingue las causas homónimas (hay tres «Otros» de merma
 *    colgando de tipos distintos), cosa que el cruce por nombre no hace.
 *  - **Personas**: el origen guarda el maquinista y el supervisor como texto
 *    libre. Se crean usuarios del MES con id y credenciales derivadas del
 *    nombre (contraseña imposible de adivinar: no son cuentas de acceso, son
 *    referencias para la trazabilidad de la orden).
 */
import { randomBytes } from 'node:crypto';
import { hashSync } from 'bcryptjs';
import type { DataSource } from 'typeorm';
import { computeOee } from '@mes/shared';
import type { OeeDetalle, Turno as TurnoCodigo, TipoMermaCodigo } from '@mes/types';
import {
  CausaMerma,
  CausaParada,
  Linea,
  Producto,
  User,
  VelocidadEstandar,
} from '../../src/database/entities';
import causasMermaJson from '../../src/database/seeds/data/real/causas-merma.json';
import causasParadaJson from '../../src/database/seeds/data/real/causas-parada.json';
import type { MermaOrigen, OrdenOrigen, ParadaOrigen, ProductoOrigen } from './origen';

/**
 * `tipo_mermas` del origen (destino físico del producto mermado) → código de
 * tipo del MES. Es la única correspondencia que no es 1:1 entre los dos
 * sistemas: el origen clasifica por **destino** y el MES por **estado del
 * material**. El nombre original se conserva en `observacion`, de modo que la
 * traducción es reversible.
 */
const DESTINO_MERMA_A_TIPO: Record<string, TipoMermaCodigo> = {
  Recuperable: 'MP',
  'Para reproceso': 'EP',
  'Para desperdicio': 'PT',
  Pruebas: 'EP',
};

/** Causa a la que van las paradas que el origen cerró sin categoría asignada. */
const CODIGO_SIN_CATEGORIZAR = 'PN-04-SC';

/** Tope del tiempo de registro (24 h): más allá es un registro diferido, no un dato de TRI. */
const MAX_REGISTRO_SEG = 86_400;

export function normalizar(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** `Jorge Quispe` → `JQ`; `Elar` → `EL`. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return nombre.slice(0, 2).toUpperCase();
}

function slug(nombre: string): string {
  return normalizar(nombre).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

/**
 * DNI sintético y estable a partir del nombre. Empieza por `9`, dígito con el
 * que no se emiten DNI peruanos de 8 cifras, para que sea evidente que es un
 * identificador derivado y no el documento real de la persona.
 */
function dniSintetico(nombre: string): string {
  let h = 0;
  for (const c of normalizar(nombre)) h = (h * 31 + c.charCodeAt(0)) % 10_000_000;
  return `9${String(h).padStart(7, '0')}`;
}

function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

function acotarRegistro(segundos: number | null | undefined): number {
  if (segundos == null || !Number.isFinite(segundos)) return 0;
  return Math.min(MAX_REGISTRO_SEG, Math.max(0, Math.round(segundos)));
}

/** `"27000 u/h"` → `27000`. Devuelve `0` cuando el texto no trae número. */
export function velocidadUnidHora(texto: string | null | undefined): number {
  const digitos = (texto ?? '').replace(/[^0-9]/g, '');
  return digitos ? Number(digitos) : 0;
}

export interface Incidencia {
  motivo: string;
  detalle: string;
}

/** Filas ya listas para insertar en el MES, más el registro de lo descartado. */
export interface Resultado {
  ordenes: Record<string, unknown>[];
  paradas: Record<string, unknown>[];
  mermas: Record<string, unknown>[];
  velocidades: Record<string, unknown>[];
  usuariosNuevos: User[];
  productosNuevos: Producto[];
  causasParadaNuevas: CausaParada[];
  causasMermaNuevas: CausaMerma[];
  incidencias: Incidencia[];
}

export class Mapeador {
  private readonly lineasPorNombre = new Map<string, Linea>();
  private readonly productosPorCodigo = new Map<string, Producto>();
  private readonly causasParada: CausaParada[] = [];
  private readonly causasMerma: CausaMerma[] = [];
  private readonly usuariosPorNombre = new Map<string, User>();
  private readonly velocidadPorPar = new Map<string, VelocidadEstandar>();
  /** Veces que se ha visto cada número de OF (una misma OF puede ejecutarse en dos jornadas). */
  private readonly jornadasPorCodigo = new Map<string, number>();
  /** `idLegado` del maestro → id de la causa en el MES. */
  private readonly paradaPorLegado = new Map<number, string>();
  private readonly mermaPorLegado = new Map<number, string>();

  private readonly usuariosNuevos: User[] = [];
  private readonly productosNuevos: Producto[] = [];
  private readonly causasParadaNuevas: CausaParada[] = [];
  private readonly causasMermaNuevas: CausaMerma[] = [];
  private readonly incidencias: Incidencia[] = [];

  private constructor() {}

  static async cargar(destino: DataSource): Promise<Mapeador> {
    const m = new Mapeador();
    for (const causa of causasParadaJson) {
      if (causa.nivel === 'especifica' && typeof causa.idLegado === 'number') {
        m.paradaPorLegado.set(causa.idLegado, causa.id);
      }
    }
    for (const causa of causasMermaJson) {
      if (causa.nivel === 'causa' && typeof causa.idLegado === 'number') {
        m.mermaPorLegado.set(causa.idLegado, causa.id);
      }
    }
    for (const linea of await destino.getRepository(Linea).find()) {
      m.lineasPorNombre.set(normalizar(linea.nombre), linea);
    }
    for (const producto of await destino.getRepository(Producto).find()) {
      m.productosPorCodigo.set(producto.codigo, producto);
    }
    m.causasParada.push(...(await destino.getRepository(CausaParada).find()));
    m.causasMerma.push(...(await destino.getRepository(CausaMerma).find()));
    for (const usuario of await destino.getRepository(User).find()) {
      m.usuariosPorNombre.set(normalizar(usuario.nombre), usuario);
    }
    for (const par of await destino.getRepository(VelocidadEstandar).find()) {
      m.velocidadPorPar.set(`${par.productoId}|${par.lineaId}`, par);
    }
    return m;
  }

  private anotar(motivo: string, detalle: string): void {
    this.incidencias.push({ motivo, detalle });
  }

  /* ------------------------------------------------------------------ */
  /* Catálogos                                                          */
  /* ------------------------------------------------------------------ */

  linea(nombreReal: string | null): Linea | null {
    return this.lineasPorNombre.get(normalizar(nombreReal)) ?? null;
  }

  /** Da de alta en el MES los productos del origen que aún no existen. */
  altaProductos(fichas: ProductoOrigen[]): void {
    for (const ficha of fichas) {
      if (this.productosPorCodigo.has(ficha.codigo)) continue;
      const nombre = ficha.descripcionCorta ?? ficha.descripcionLarga ?? `Producto ${ficha.codigo}`;
      const producto = Object.assign(new Producto(), {
        id: `PRD-${ficha.codigo}`,
        codigo: ficha.codigo,
        nombre,
        descripcionLarga: ficha.descripcionLarga ?? '',
        descripcionCorta: ficha.descripcionCorta ?? nombre,
        alias: ficha.alias,
        marca: ficha.marca,
        presentacion: ficha.presentacion,
        unidadesPorCaja: ficha.unidades && ficha.unidades > 0 ? ficha.unidades : 1,
        pesoKg: ficha.pesoKg ?? 0,
        saborId: null,
        sabor: '',
        estado: ficha.estado === false ? 'inactivo' : 'activo',
      } satisfies Partial<Producto>);
      this.productosPorCodigo.set(ficha.codigo, producto);
      this.productosNuevos.push(producto);
    }
  }

  producto(codigo: string | null): Producto | null {
    return codigo ? (this.productosPorCodigo.get(codigo) ?? null) : null;
  }

  /** Sube por `parentId` hasta la raíz del árbol de causas de parada. */
  private raizParada(causa: CausaParada): CausaParada {
    let actual = causa;
    const vistos = new Set<string>();
    while (actual.parentId && !vistos.has(actual.id)) {
      vistos.add(actual.id);
      const padre = this.causasParada.find((c) => c.id === actual.parentId);
      if (!padre) break;
      actual = padre;
    }
    return actual;
  }

  /** Hoja `PN-04-SC`, donde aterrizan las paradas cuya causa no se puede resolver. */
  private causaSinCategorizar(): CausaParada | null {
    const existente = this.causasParada.find((c) => c.codigo === CODIGO_SIN_CATEGORIZAR);
    if (existente) return existente;

    const tipo = this.causasParada.find(
      (c) => c.nivel === 'tipo' && normalizar(c.nombre) === normalizar('Paro imprevisto'),
    );
    if (!tipo) {
      this.anotar('parada sin causa resoluble', 'no existe el tipo «Paro imprevisto» en el maestro');
      return null;
    }
    const general =
      this.causasParada.find(
        (c) => c.nivel === 'general' && c.parentId === tipo.id && normalizar(c.nombre) === 'OTROS',
      ) ?? null;
    const hoja = Object.assign(new CausaParada(), {
      id: `CPA-${CODIGO_SIN_CATEGORIZAR}`,
      codigo: CODIGO_SIN_CATEGORIZAR,
      nombre: 'Sin categorizar',
      nivel: 'especifica',
      parentId: (general ?? tipo).id,
      clasificacion: tipo.clasificacion,
      afectaOee: true,
      requiereEvidencia: false,
      requiereSolicitud: false,
      tiempoEstandarMin: 0,
      lineasAplicables: [],
      estado: 'activo',
      paradasHistoricas: 0,
      codigoLegado: null,
    } satisfies Partial<CausaParada>);
    this.causasParada.push(hoja);
    this.causasParadaNuevas.push(hoja);
    return hoja;
  }

  /**
   * Resuelve la causa de una parada y devuelve `[hoja, raíz]`.
   *
   * El origen guarda en la tabla puente el id de la causa **en la numeración del
   * maestro** (`idLegado`), no en la de la tabla `parada_categoria_especificas`
   * vigente, que fue renumerada. Las causas que el maestro no conoce —añadidas
   * al sistema real después de la extracción— caen en `PN-04-SC · Sin
   * categorizar` y se reportan: inventarles un nombre a partir de la tabla
   * renumerada produciría causas falsas, que es justo lo que hay que evitar.
   */
  causaParada(fila: ParadaOrigen): [CausaParada, CausaParada] | null {
    const idMes =
      fila.categoriaEspecificaId != null
        ? this.paradaPorLegado.get(fila.categoriaEspecificaId)
        : undefined;
    const hoja = idMes ? this.causasParada.find((c) => c.id === idMes) : undefined;

    if (!hoja) {
      this.anotar(
        fila.categoriaEspecificaId == null
          ? 'parada sin categoría en el origen'
          : 'causa de parada fuera del maestro',
        fila.categoriaEspecificaId == null
          ? `parada ${fila.paradaId}`
          : `categoria_especifica_id=${fila.categoriaEspecificaId}`,
      );
      const sinCategorizar = this.causaSinCategorizar();
      return sinCategorizar ? [sinCategorizar, this.raizParada(sinCategorizar)] : null;
    }
    return [hoja, this.raizParada(hoja)];
  }

  /**
   * Devuelve `[hoja, clasificación, tipo]` del árbol de causas de merma,
   * resuelto también por `idLegado`. Cruzar por nombre no serviría: el maestro
   * tiene causas homónimas colgando de tipos distintos (tres «Otros», cuatro
   * «Falla palera»…) y todas acabarían en la primera.
   */
  causaMerma(fila: MermaOrigen): [CausaMerma, CausaMerma | null, CausaMerma] | null {
    const idMes =
      fila.causaLegadoId != null ? this.mermaPorLegado.get(fila.causaLegadoId) : undefined;
    const hoja = idMes ? this.causasMerma.find((c) => c.id === idMes) : undefined;
    if (!hoja) {
      this.anotar(
        'causa de merma fuera del maestro',
        `merma_causa_id=${fila.causaLegadoId ?? 'nulo'} · ${fila.causaNombre ?? 'sin nombre'}`,
      );
      return null;
    }

    const padre = this.causasMerma.find((c) => c.id === hoja.parentId) ?? null;
    const clasificacion = padre?.nivel === 'clasificacion' ? padre : null;
    const tipo = clasificacion
      ? (this.causasMerma.find((c) => c.id === clasificacion.parentId) ?? clasificacion)
      : (padre ?? hoja);
    return [hoja, clasificacion, tipo];
  }

  /**
   * Usuario del MES para un nombre libre del origen. Si no existe se crea con
   * una contraseña aleatoria que nadie conoce: estas cuentas identifican a quien
   * operó la orden, no sirven para entrar a la aplicación.
   */
  usuario(nombre: string | null, rol: 'maquinista' | 'supervisor', lineaId: string | null): User | null {
    if (!nombre) return null;
    const clave = normalizar(nombre);
    const existente = this.usuariosPorNombre.get(clave);
    if (existente) return existente;

    const identificador = slug(nombre);
    const usuario = Object.assign(new User(), {
      id: `USR-R-${identificador.replace(/\./g, '-')}`,
      nombre,
      email: `${identificador}@yamboly.lat`,
      dni: dniSintetico(nombre),
      rol,
      cargo: rol === 'supervisor' ? 'Supervisor de producción' : 'Maquinista',
      sedeId: 'SED-LIMA',
      lineaId: rol === 'maquinista' ? lineaId : null,
      iniciales: iniciales(nombre),
      avatarUrl: null,
      activo: true,
      ultimoAcceso: null,
      passwordHash: hashSync(randomBytes(24).toString('hex'), 8),
    } satisfies Partial<User>);
    this.usuariosPorNombre.set(clave, usuario);
    this.usuariosNuevos.push(usuario);
    return usuario;
  }

  /* ------------------------------------------------------------------ */
  /* Filas                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Traduce una orden del origen. Devuelve `null` cuando la orden no puede
   * representarse en el MES (línea desconocida, producto sin ficha, sin
   * maquinista), anotando el motivo.
   *
   * Conversión de unidades: el origen trabaja en **cajas** y el MES en
   * **unidades**, así que todo se multiplica por `unidadesPorCaja`. La velocidad
   * estándar del origen viene en u/h y el MES la guarda en u/min.
   */
  orden(fila: OrdenOrigen): { orden: Record<string, unknown>; unidadesPorCaja: number } | null {
    const linea = this.linea(fila.lineaProduccion);
    if (!linea) {
      this.anotar('línea fuera del maestro del MES', `${fila.lineaProduccion ?? '—'} · OF ${fila.codigo}`);
      return null;
    }
    const producto = this.producto(fila.codigoProducto);
    if (!producto) {
      this.anotar('producto sin ficha', `${fila.codigoProducto ?? '—'} · OF ${fila.codigo}`);
      return null;
    }
    if (!fila.inicio) {
      this.anotar('orden sin hora de inicio', `OF ${fila.codigo}`);
      return null;
    }
    const maquinista = this.usuario(fila.maquinista, 'maquinista', linea.id);
    const supervisor = this.usuario(fila.supervisor, 'supervisor', null);
    if (!maquinista || !supervisor) {
      this.anotar('orden sin maquinista o supervisor', `OF ${fila.codigo}`);
      return null;
    }

    const unidadesPorCaja = producto.unidadesPorCaja > 0 ? producto.unidadesPorCaja : 1;
    const producidoCajas =
      fila.totalProducidoCajas && fila.totalProducidoCajas > 0
        ? fila.totalProducidoCajas
        : (fila.maxCodificadoraCajas ?? 0);
    const codificadoraCajas =
      fila.totalCodificadoraCajas && fila.totalCodificadoraCajas > 0
        ? fila.totalCodificadoraCajas
        : (fila.maxCodificadoraCajas ?? 0);

    const par = this.velocidadPorPar.get(`${producto.id}|${linea.id}`) ?? null;
    const unidHora = velocidadUnidHora(fila.velocidadEstandarTexto);
    const velocidadEstandar = unidHora > 0 ? redondear(unidHora / 60, 2) : (par?.velocidadUnidMin ?? 0);

    const turno: TurnoCodigo = fila.turno === '2' ? 'N' : 'D';
    const abierta = fila.abierta === true;
    const estado = fila.incompleto
      ? 'incompleta'
      : abierta
        ? 'en_curso'
        : fila.validado
          ? 'validada'
          : 'por_validar';

    /* OEE: el origen ya publica disponibilidad, rendimiento y calidad calculados
     * por su propio motor. Se respetan tal cual; el OEE total es su producto. */
    const disponibilidad = redondear(fila.disponibilidad ?? 0);
    const desempeno = redondear(fila.rendimiento ?? 0);
    const calidad = redondear(fila.calidad ?? 0);
    const oee: OeeDetalle = {
      oee: redondear((disponibilidad / 100) * (desempeno / 100) * (calidad / 100) * 100),
      disponibilidad,
      desempeno,
      calidad,
    };

    const lote = fila.lote ?? `L-${fila.fecha.slice(2).replace(/-/g, '')}-${linea.codigo}`;

    /* Una OF puede tener más de un registro de ejecución (la jornada se corta y
     * se retoma al día siguiente). El MES exige código único por orden, así que
     * la segunda jornada en adelante lleva sufijo `-2`, `-3`… */
    const jornada = (this.jornadasPorCodigo.get(fila.codigo) ?? 0) + 1;
    this.jornadasPorCodigo.set(fila.codigo, jornada);
    const codigo = jornada === 1 ? fila.codigo : `${fila.codigo}-${jornada}`;

    return {
      unidadesPorCaja,
      orden: {
        id: `ORD-${codigo}`,
        codigo,
        fecha: fila.fecha,
        lineaId: linea.id,
        productoId: producto.id,
        turno,
        lote,
        vencimiento: fila.vencimiento ?? '',
        planificado: fila.planificadoCajas * unidadesPorCaja,
        producido: producidoCajas * unidadesPorCaja,
        conteoCodificadora: codificadoraCajas * unidadesPorCaja,
        velocidadEstandar,
        velocidadEstandarId: par?.id ?? null,
        estado,
        maquinistaId: maquinista.id,
        supervisorId: supervisor.id,
        operarios: fila.numeroOperarios ?? 0,
        colaboradores: [],
        oee,
        paradasCount: 0,
        mermasKg: 0,
        inicio: fila.inicio,
        fin: abierta ? null : fila.fin,
        observacion: fila.comentarios,
      },
    };
  }

  /**
   * Completa el OEE de las órdenes que el origen todavía no ha cerrado.
   *
   * El motor del sistema real calcula disponibilidad, rendimiento y calidad al
   * validar la orden; mientras sigue abierta publica ceros. Para esas órdenes se
   * calcula el OEE con la fórmula del propio MES (`computeOee`) sobre datos
   * igualmente reales: unidades del contador de la codificadora, minutos
   * transcurridos, minutos de parada con impacto y kg de merma. Las órdenes que
   * el origen sí calculó se respetan tal cual.
   */
  completarOee(
    orden: Record<string, unknown>,
    datos: { paradasMin: number; mermaKg: number; ahora: string },
  ): void {
    const oee = orden.oee as OeeDetalle;
    if (oee.desempeno > 1 && oee.calidad > 1) return;

    const inicio = orden.inicio as string;
    const fin = (orden.fin as string | null) ?? datos.ahora;
    const minutos = Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60_000));
    const producidas = orden.producido as number;
    const codigo = (orden.productoId as string).replace('PRD-', '');
    const pesoKg = this.productosPorCodigo.get(codigo)?.pesoKg ?? 0;
    const unidadesMermadas = pesoKg > 0 ? Math.round(datos.mermaKg / pesoKg) : 0;

    orden.oee = computeOee({
      tiempoPlanificadoMin: minutos,
      paradasMin: datos.paradasMin,
      unidadesProducidas: producidas,
      unidadesBuenas: Math.max(0, producidas - unidadesMermadas),
      velocidadEstandar: orden.velocidadEstandar as number,
    });
  }

  parada(
    fila: ParadaOrigen,
    orden: { id: string; lineaId: string; maquinistaId: string },
    correlativo: number,
  ): Record<string, unknown> | null {
    if (!fila.inicio) {
      this.anotar('parada sin hora de inicio', `id origen ${fila.paradaId}`);
      return null;
    }
    const causas = this.causaParada(fila);
    if (!causas) return null;
    const [hoja, raiz] = causas;
    const duracionMin = fila.segundos != null ? Math.round(fila.segundos / 60) : 0;

    return {
      id: `PAR-${orden.id.replace('ORD-', '')}-${String(correlativo).padStart(2, '0')}`,
      ordenId: orden.id,
      lineaId: orden.lineaId,
      causaId: hoja.id,
      tipoCausaId: raiz.id,
      inicio: fila.inicio,
      fin: fila.fin,
      duracionMin,
      accionTomada: fila.comentario ?? '',
      numeroSolicitud: fila.numeroSolicitud,
      evidenciaUrl: null,
      afectaOee: hoja.afectaOee,
      responsableId: orden.maquinistaId,
      origen: 'manual',
      deteccionId: null,
      tiempoRegistroSeg: acotarRegistro(fila.registroSeg),
      comentarioCierre: null,
    };
  }

  merma(
    fila: MermaOrigen,
    orden: { id: string; lineaId: string; maquinistaId: string },
    correlativo: number,
  ): Record<string, unknown> | null {
    if (!fila.hora) {
      this.anotar('merma sin hora', `id origen ${fila.mermaId}`);
      return null;
    }
    const causas = this.causaMerma(fila);
    if (!causas) return null;
    const [hoja, clasificacion, tipoCausa] = causas;
    const destino = (fila.tipoMermaNombre ?? '').trim();
    const tipo = DESTINO_MERMA_A_TIPO[destino] ?? 'EP';
    const observacion = [fila.comentario, destino ? `Destino: ${destino}` : null]
      .filter(Boolean)
      .join(' · ');

    return {
      id: `MER-${orden.id.replace('ORD-', '')}-${String(correlativo).padStart(2, '0')}`,
      ordenId: orden.id,
      lineaId: orden.lineaId,
      tipo,
      cantidadKg: redondear(fila.pesoKg ?? 0, 2),
      sabor: fila.sabor ?? '',
      tipoCausaId: tipoCausa.id,
      clasificacionId: clasificacion?.id ?? null,
      causaId: hoja.id,
      numeroSolicitud: fila.numeroSolicitud,
      responsableId: orden.maquinistaId,
      codigoBalde: null,
      enviarPasteurizacion: destino === 'Para reproceso',
      registradaEn: fila.hora,
      tiempoRegistroSeg: acotarRegistro(fila.registroSeg),
      observacion: observacion || null,
    };
  }

  velocidad(
    fila: { hora: string | null; velocidadUnidHora: number | null; observacion: string | null; registroSeg: number | null },
    orden: { id: string; lineaId: string; maquinistaId: string; velocidadEstandar: number },
    correlativo: number,
  ): Record<string, unknown> | null {
    if (!fila.hora || fila.velocidadUnidHora == null) return null;
    const velocidadReal = redondear(fila.velocidadUnidHora / 60, 2);
    const estandar = orden.velocidadEstandar;
    return {
      id: `VEL-${orden.id.replace('ORD-', '')}-${String(correlativo).padStart(2, '0')}`,
      ordenId: orden.id,
      lineaId: orden.lineaId,
      registradaEn: fila.hora,
      velocidadReal,
      velocidadEstandar: estandar,
      desvioPct: estandar > 0 ? redondear(((velocidadReal - estandar) / estandar) * 100) : 0,
      motivo: fila.observacion,
      responsableId: orden.maquinistaId,
      tiempoRegistroSeg: acotarRegistro(fila.registroSeg),
    };
  }

  /* ------------------------------------------------------------------ */

  altas(): Pick<
    Resultado,
    'usuariosNuevos' | 'productosNuevos' | 'causasParadaNuevas' | 'causasMermaNuevas' | 'incidencias'
  > {
    return {
      usuariosNuevos: this.usuariosNuevos,
      productosNuevos: this.productosNuevos,
      causasParadaNuevas: this.causasParadaNuevas,
      causasMermaNuevas: this.causasMermaNuevas,
      incidencias: this.incidencias,
    };
  }
}
