/**
 * Sincronización de producción real: `pnpm sync:real`
 * (o `pnpm --filter @mes/api sincronizar`).
 *
 * Trae de la base del sistema en producción (`yamboli-back`, Strapi 5 sobre
 * PostgreSQL `sitemaster`) las órdenes de fabricación, paradas, mermas y
 * lecturas de velocidad de una ventana de días, las traduce al modelo del MES y
 * **reemplaza** con ellas los datos de producción sembrados. Después recalcula
 * los agregados de Reportes para que todas las vistas cuenten lo mismo.
 *
 * Qué se trae y qué no: el origen guarda mucha más información de la que el MES
 * modela (overrun por productora, pesos por orden, checklists, consumos de
 * ingredientes, almacenes, pagos…). Aquí se usa **sólo lo que el MES ya guarda**:
 *
 *   orden_fabricacion_dbs + orden_fabricacions → orden_fabricacion
 *   paradas                                    → parada
 *   calidads                                   → merma
 *   rendimientos                               → registro_velocidad
 *
 * Los catálogos (líneas, productos, causas) son el maestro real que ya vive en
 * el MES; sólo se dan de alta las entradas que el origen usa y el maestro aún no
 * conoce, y se reportan al final.
 *
 * El origen se abre en **modo sólo lectura**: nunca se escribe en producción.
 *
 * Opciones:
 *   --dias=30                 tamaño de la ventana hacia atrás (por defecto 30)
 *   --desde=YYYY-MM-DD        inicio explícito (requiere --hasta)
 *   --hasta=YYYY-MM-DD        fin explícito (por defecto, hoy según el origen)
 *   --origen=postgres://…     base de origen (si no, ORIGEN_DATABASE_URL o el
 *                             .env de yamboli-back)
 *   --destino=postgres://…    base del MES (por defecto DATABASE_URL)
 *   --costo-merma=9.5         S/ por kg con los que se valoriza la merma en el
 *                             KPI de Reportes
 *   --agregados-dias=30       limita a esos días la foto pre-agregada de Reportes
 *   --informe=ruta.json       guarda conteos, incidencias y verificaciones
 *   --sin-agregados           no recalcular las tablas de Reportes
 *   --tiempos-tri             vuelca los eventos importados en la hoja de
 *                             observación del TRI (Anexo 02). Desactivado por
 *                             defecto: ver `sincronizacion/tiempos.ts`
 *   --simular                 lee y mapea, pero no escribe nada (dry run)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntityManager } from 'typeorm';
import { ahoraIso } from '../src/common/utils';
import { crearDataSource } from '../src/database/data-source';
import {
  AuditEvent,
  CausaMerma,
  CausaParada,
  DeteccionIoT,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  RegistroVelocidad,
  User,
} from '../src/database/entities';
import { recalcularAgregados } from './sincronizacion/agregados';
import { regenerarHojaTri } from './sincronizacion/tiempos';
import { Mapeador } from './sincronizacion/mapeo';
import { OrigenReal, ocultarClave, resolverUrlOrigen } from './sincronizacion/origen';
import type { MermaOrigen, OrdenOrigen } from './sincronizacion/origen';

const TAMANO_LOTE = 500;
const DIAS_POR_DEFECTO = 30;
const DIAS_AGREGADOS_POR_DEFECTO = 30;
const COSTO_MERMA_POR_DEFECTO = 9.5;

/** Límites de seguridad aprobados para aceptar una carga histórica. */
const UMBRAL_ORDENES_DESCARTADAS_PCT = 0.5;
const UMBRAL_PARADAS_SIN_CATEGORIZAR_GLOBAL_PCT = 1;
const UMBRAL_PARADAS_SIN_CATEGORIZAR_MENSUAL_PCT = 2;
const UMBRAL_MERMAS_CAUSA_NULA_GLOBAL_PCT = 3;
const UMBRAL_MERMAS_CAUSA_NULA_MENSUAL_PCT = 5;
const CODIGO_PARADA_SIN_CATEGORIZAR = 'PN-04-SC';
const ID_PARADA_SIN_CATEGORIZAR = `CPA-${CODIGO_PARADA_SIN_CATEGORIZAR}`;
const MOTIVO_MERMA_CAUSA_NULA = 'merma descartada por causa nula';

/** Lector minimalista de `.env` (el script corre fuera del contexto Nest). */
function cargarEnv(archivo = '.env'): void {
  const ruta = resolve(process.cwd(), archivo);
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 0) continue;
    const clave = limpia.slice(0, corte).trim();
    const valor = limpia
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

function opcion(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}

function bandera(nombre: string): boolean {
  return process.argv.includes(`--${nombre}`);
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function trocear<T>(filas: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < filas.length; i += tamano) lotes.push(filas.slice(i, i + tamano));
  return lotes;
}

async function insertarEnLotes(
  gestor: EntityManager,
  entidad: Parameters<EntityManager['getRepository']>[0],
  filas: unknown[],
): Promise<number> {
  for (const lote of trocear(filas, TAMANO_LOTE)) {
    await gestor.getRepository(entidad as never).insert(lote as never);
  }
  return filas.length;
}

function tabla(filas: [string, string | number][]): string {
  const ancho = Math.max(...filas.map(([k]) => k.length));
  return filas.map(([k, v]) => `  ${k.padEnd(ancho)}  ${v}`).join('\n');
}

function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 10_000) / 100 : 0;
}

function superaUmbral(parte: number, total: number, umbralPct: number): boolean {
  return total > 0 && (parte / total) * 100 > umbralPct;
}

function mesDe(fecha: string | null | undefined): string {
  return fecha && /^\d{4}-\d{2}/.test(fecha) ? fecha.slice(0, 7) : 'sin-fecha';
}

function contarPorMes<T>(filas: T[], fecha: (fila: T) => string | null | undefined): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const fila of filas) {
    const mes = mesDe(fecha(fila));
    resultado[mes] = (resultado[mes] ?? 0) + 1;
  }
  return resultado;
}

function registrarProgreso(fase: string, conteo: string | number, inicio: number): void {
  console.log(`  ${fase}: ${conteo} · ${Date.now() - inicio} ms`);
}

function comandoActual(): string {
  return process.argv
    .map((argumento) => ocultarClave(argumento))
    .map((argumento) => (/^[a-zA-Z0-9_./:=@-]+$/.test(argumento) ? argumento : JSON.stringify(argumento)))
    .join(' ');
}

type Verificacion = Record<string, unknown>;

function incidenciasPorMotivoYMes(
  incidencias: ReturnType<Mapeador['altas']>['incidencias'],
): Record<string, Record<string, number>> {
  const resultado: Record<string, Record<string, number>> = {};
  for (const { motivo, mes } of incidencias) {
    resultado[motivo] ??= {};
    resultado[motivo][mes] = (resultado[motivo][mes] ?? 0) + 1;
  }
  return resultado;
}

interface DatosValidacion {
  desde: string;
  hasta: string;
  ordenesOrigen: OrdenOrigen[];
  ordenes: Record<string, unknown>[];
  paradas: Record<string, unknown>[];
  mermasOrigen: MermaOrigen[];
  mermas: Record<string, unknown>[];
  velocidades: Record<string, unknown>[];
  altas: ReturnType<Mapeador['altas']>;
}

function validarMapeo(datos: DatosValidacion): { verificaciones: Verificacion; errores: string[] } {
  const errores: string[] = [];
  const ordenesDescartadas = datos.ordenesOrigen.length - datos.ordenes.length;
  const pctOrdenesDescartadas = porcentaje(ordenesDescartadas, datos.ordenesOrigen.length);
  if (superaUmbral(ordenesDescartadas, datos.ordenesOrigen.length, UMBRAL_ORDENES_DESCARTADAS_PCT)) {
    errores.push(
      `órdenes descartadas: ${pctOrdenesDescartadas}% > ${UMBRAL_ORDENES_DESCARTADAS_PCT}%`,
    );
  }

  const causasNuevasInvalidas = [
    ...datos.altas.causasParadaNuevas
      .filter((causa) => causa.codigo !== CODIGO_PARADA_SIN_CATEGORIZAR)
      .map((causa) => causa.codigo),
    ...datos.altas.causasMermaNuevas.map((causa) => causa.codigo),
  ];
  if (causasNuevasInvalidas.length > 0) {
    errores.push(`altas de causas no permitidas: ${causasNuevasInvalidas.join(', ')}`);
  }

  const fechaPorOrden = new Map(
    datos.ordenes.map((orden) => [orden.id as string, orden.fecha as string]),
  );
  const totalParadasPorMes = contarPorMes(datos.paradas, (parada) =>
    fechaPorOrden.get(parada.ordenId as string),
  );
  const paradasSinCategorizar = datos.paradas.filter(
    (parada) => parada.causaId === ID_PARADA_SIN_CATEGORIZAR,
  );
  const sinCategorizarPorMes = contarPorMes(paradasSinCategorizar, (parada) =>
    fechaPorOrden.get(parada.ordenId as string),
  );
  const pctParadasGlobal = porcentaje(paradasSinCategorizar.length, datos.paradas.length);
  const paradasMensuales = Object.fromEntries(
    Object.keys(totalParadasPorMes)
      .sort()
      .map((mes) => {
        const pct = porcentaje(sinCategorizarPorMes[mes] ?? 0, totalParadasPorMes[mes]);
        if (
          superaUmbral(
            sinCategorizarPorMes[mes] ?? 0,
            totalParadasPorMes[mes],
            UMBRAL_PARADAS_SIN_CATEGORIZAR_MENSUAL_PCT,
          )
        ) {
          errores.push(
            `paradas ${CODIGO_PARADA_SIN_CATEGORIZAR} en ${mes}: ${pct}% > ` +
              `${UMBRAL_PARADAS_SIN_CATEGORIZAR_MENSUAL_PCT}%`,
          );
        }
        return [mes, { cantidad: sinCategorizarPorMes[mes] ?? 0, total: totalParadasPorMes[mes], porcentaje: pct }];
      }),
  );
  if (
    superaUmbral(
      paradasSinCategorizar.length,
      datos.paradas.length,
      UMBRAL_PARADAS_SIN_CATEGORIZAR_GLOBAL_PCT,
    )
  ) {
    errores.push(
      `paradas ${CODIGO_PARADA_SIN_CATEGORIZAR}: ${pctParadasGlobal}% > ` +
        `${UMBRAL_PARADAS_SIN_CATEGORIZAR_GLOBAL_PCT}%`,
    );
  }

  const incidencias = incidenciasPorMotivoYMes(datos.altas.incidencias);
  const mermasNulasPorMes = incidencias[MOTIVO_MERMA_CAUSA_NULA] ?? {};
  const totalMermasPorMes = contarPorMes(datos.mermasOrigen, (merma) => merma.hora);
  const mermasNulas = Object.values(mermasNulasPorMes).reduce((total, cantidad) => total + cantidad, 0);
  const pctMermasNulas = porcentaje(mermasNulas, datos.mermasOrigen.length);
  const mermasMensuales = Object.fromEntries(
    Object.keys(totalMermasPorMes)
      .sort()
      .map((mes) => {
        const pct = porcentaje(mermasNulasPorMes[mes] ?? 0, totalMermasPorMes[mes]);
        if (
          superaUmbral(
            mermasNulasPorMes[mes] ?? 0,
            totalMermasPorMes[mes],
            UMBRAL_MERMAS_CAUSA_NULA_MENSUAL_PCT,
          )
        ) {
          errores.push(
            `mermas con causa nula en ${mes}: ${pct}% > ${UMBRAL_MERMAS_CAUSA_NULA_MENSUAL_PCT}%`,
          );
        }
        return [mes, { cantidad: mermasNulasPorMes[mes] ?? 0, total: totalMermasPorMes[mes], porcentaje: pct }];
      }),
  );
  if (
    superaUmbral(
      mermasNulas,
      datos.mermasOrigen.length,
      UMBRAL_MERMAS_CAUSA_NULA_GLOBAL_PCT,
    )
  ) {
    errores.push(
      `mermas con causa nula: ${pctMermasNulas}% > ${UMBRAL_MERMAS_CAUSA_NULA_GLOBAL_PCT}%`,
    );
  }

  const corteAbiertas = restarDias(datos.hasta, 1);
  const abiertasAntiguas = datos.ordenes.filter(
    (orden) => orden.fin == null && (orden.fecha as string) < corteAbiertas,
  ).length;
  if (abiertasAntiguas > 0) {
    errores.push(`órdenes abiertas anteriores a ${corteAbiertas}: ${abiertasAntiguas}`);
  }

  return {
    errores,
    verificaciones: {
      umbralesPct: {
        ordenesDescartadas: UMBRAL_ORDENES_DESCARTADAS_PCT,
        paradasSinCategorizarGlobal: UMBRAL_PARADAS_SIN_CATEGORIZAR_GLOBAL_PCT,
        paradasSinCategorizarMensual: UMBRAL_PARADAS_SIN_CATEGORIZAR_MENSUAL_PCT,
        mermasCausaNulaGlobal: UMBRAL_MERMAS_CAUSA_NULA_GLOBAL_PCT,
        mermasCausaNulaMensual: UMBRAL_MERMAS_CAUSA_NULA_MENSUAL_PCT,
      },
      ordenesDescartadas: {
        cantidad: ordenesDescartadas,
        total: datos.ordenesOrigen.length,
        porcentaje: pctOrdenesDescartadas,
      },
      altasCausasNoPermitidas: causasNuevasInvalidas,
      paradasSinCategorizar: {
        cantidad: paradasSinCategorizar.length,
        total: datos.paradas.length,
        porcentaje: pctParadasGlobal,
        porMes: paradasMensuales,
      },
      mermasDescartadasPorCausaNula: {
        cantidad: mermasNulas,
        total: datos.mermasOrigen.length,
        porcentaje: pctMermasNulas,
        porMes: mermasMensuales,
      },
      ordenesAbiertasAntiguas: abiertasAntiguas,
      correcta: errores.length === 0,
    },
  };
}

async function verificarDestino(
  gestor: EntityManager,
  datos: DatosValidacion,
  verificaciones: Verificacion,
  erroresPrevios: string[],
): Promise<void> {
  const esperados: Record<string, number> = {
    audit_event: 0,
    registro_velocidad: datos.velocidades.length,
    merma: datos.mermas.length,
    parada: datos.paradas.length,
    deteccion_iot: 0,
    orden_fabricacion: datos.ordenes.length,
  };

  const conteos = (await gestor.query(
    `select 'audit_event' as tabla, count(*)::int as conteo from audit_event
     union all select 'registro_velocidad', count(*)::int from registro_velocidad
     union all select 'merma', count(*)::int from merma
     union all select 'parada', count(*)::int from parada
     union all select 'deteccion_iot', count(*)::int from deteccion_iot
     union all select 'orden_fabricacion', count(*)::int from orden_fabricacion`,
  )) as { tabla: string; conteo: number }[];
  const conteosDestino = Object.fromEntries(conteos.map((fila) => [fila.tabla, Number(fila.conteo)]));
  const errores = [...erroresPrevios];
  for (const [nombre, esperado] of Object.entries(esperados)) {
    if (conteosDestino[nombre] !== esperado) {
      errores.push(`${nombre}: ${conteosDestino[nombre]} filas en destino, se esperaban ${esperado}`);
    }
  }

  const [rango] = (await gestor.query(
    `select min(fecha) as "fechaMin", max(fecha) as "fechaMax" from orden_fabricacion`,
  )) as { fechaMin: string | null; fechaMax: string | null }[];
  if (
    (rango.fechaMin != null && rango.fechaMin < datos.desde) ||
    (rango.fechaMax != null && rango.fechaMax > datos.hasta)
  ) {
    errores.push(
      `rango persistido ${rango.fechaMin ?? '—'} → ${rango.fechaMax ?? '—'} fuera de ` +
        `${datos.desde} → ${datos.hasta}`,
    );
  }

  const [abiertas] = (await gestor.query(
    `select count(*)::int as cantidad
       from orden_fabricacion
      where fin is null and fecha::date < $1::date - 1`,
    [datos.hasta],
  )) as { cantidad: number }[];
  if (Number(abiertas.cantidad) > 0) {
    errores.push(`órdenes abiertas antiguas persistidas: ${abiertas.cantidad}`);
  }

  const paradasMes = (await gestor.query(
    `select substring(o.fecha, 1, 7) as mes,
            count(*)::int as total,
            count(*) filter (where c.codigo = $1)::int as "sinCategorizar"
       from parada p
       join orden_fabricacion o on o.id = p."ordenId"
       join causa_parada c on c.id = p."causaId"
      group by substring(o.fecha, 1, 7)
      order by mes`,
    [CODIGO_PARADA_SIN_CATEGORIZAR],
  )) as { mes: string; total: number; sinCategorizar: number }[];
  const totalParadas = paradasMes.reduce((total, fila) => total + Number(fila.total), 0);
  const totalSinCategorizar = paradasMes.reduce(
    (total, fila) => total + Number(fila.sinCategorizar),
    0,
  );
  const pctGlobal = porcentaje(totalSinCategorizar, totalParadas);
  if (
    superaUmbral(
      totalSinCategorizar,
      totalParadas,
      UMBRAL_PARADAS_SIN_CATEGORIZAR_GLOBAL_PCT,
    )
  ) {
    errores.push(`paradas sin categorizar persistidas: ${pctGlobal}% global`);
  }
  for (const fila of paradasMes) {
    const pct = porcentaje(Number(fila.sinCategorizar), Number(fila.total));
    if (
      superaUmbral(
        Number(fila.sinCategorizar),
        Number(fila.total),
        UMBRAL_PARADAS_SIN_CATEGORIZAR_MENSUAL_PCT,
      )
    ) {
      errores.push(`paradas sin categorizar persistidas en ${fila.mes}: ${pct}%`);
    }
  }

  verificaciones.destino = {
    conteos: conteosDestino,
    rangoOrdenes: rango,
    ordenesAbiertasAntiguas: Number(abiertas.cantidad),
    paradasSinCategorizar: {
      cantidad: totalSinCategorizar,
      total: totalParadas,
      porcentaje: pctGlobal,
      porMes: Object.fromEntries(
        paradasMes.map((fila) => [
          fila.mes,
          {
            cantidad: Number(fila.sinCategorizar),
            total: Number(fila.total),
            porcentaje: porcentaje(Number(fila.sinCategorizar), Number(fila.total)),
          },
        ]),
      ),
    },
  };
  verificaciones.correcta = errores.length === 0;
  if (errores.length > 0) {
    throw new Error(`Verificación fallida; se revierte la transacción:\n- ${errores.join('\n- ')}`);
  }
}

async function main(): Promise<void> {
  cargarEnv();

  const simular = bandera('simular');
  const sinAgregados = bandera('sin-agregados');
  const tiemposTri = bandera('tiempos-tri');
  const desdeExplicito = opcion('desde');
  const hastaExplicito = opcion('hasta');
  const dias = Number(opcion('dias') ?? DIAS_POR_DEFECTO);
  const agregadosDias = Number(opcion('agregados-dias') ?? DIAS_AGREGADOS_POR_DEFECTO);
  const costoMermaSolKg = Number(opcion('costo-merma') ?? COSTO_MERMA_POR_DEFECTO);
  const rutaInforme = opcion('informe');
  if (!Number.isInteger(dias) || dias < 1) throw new Error('--dias debe ser un entero positivo.');
  if (!Number.isInteger(agregadosDias) || agregadosDias < 1) {
    throw new Error('--agregados-dias debe ser un entero positivo.');
  }
  if (dias > 60 && !desdeExplicito) {
    throw new Error(
      `Una ventana de ${dias} días debe ser reproducible: usa --desde=YYYY-MM-DD ` +
        'y --hasta=YYYY-MM-DD en vez de calcularla respecto de hoy.',
    );
  }
  if (desdeExplicito && !hastaExplicito) {
    throw new Error('--desde requiere --hasta para definir una ventana reproducible.');
  }

  const urlOrigen = resolverUrlOrigen(opcion('origen'));
  const urlDestino = opcion('destino') ?? process.env.DATABASE_URL;
  if (!urlDestino) {
    throw new Error('Falta la base del MES: define DATABASE_URL en apps/api/.env o usa --destino=…');
  }

  console.log('Sincronización de producción real');
  console.log(`  origen  ${ocultarClave(urlOrigen)}`);
  console.log(`  destino ${ocultarClave(urlDestino)}`);

  const origen = await OrigenReal.abrir(urlOrigen);
  const destino = crearDataSource({ databaseUrl: urlDestino });

  try {
    await destino.initialize();
    const inicioFecha = Date.now();
    const hasta = hastaExplicito ?? (await origen.fechaDelServidor());
    registrarProgreso('fecha del servidor origen', hasta, inicioFecha);
    const desde = desdeExplicito ?? restarDias(hasta, dias - 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      throw new Error('--desde y --hasta deben usar el formato YYYY-MM-DD.');
    }
    if (desde > hasta) throw new Error(`Ventana inválida: --desde=${desde} es posterior a --hasta=${hasta}.`);
    console.log(`  ventana ${desde} → ${hasta}${simular ? '  (simulación, no escribe)' : ''}\n`);

    /* ---------------- Lectura y mapeo ---------------- */

    let inicio = Date.now();
    const mapeador = await Mapeador.cargar(destino);
    registrarProgreso('catálogos del MES cargados', 5, inicio);

    await origen.iniciarSnapshot();
    console.log('  snapshot REPEATABLE READ READ ONLY iniciado');

    inicio = Date.now();
    const ordenesOrigen = await origen.ordenes(desde, hasta);
    registrarProgreso('órdenes extraídas', ordenesOrigen.length, inicio);

    const codigosFaltantes = [
      ...new Set(
        ordenesOrigen
          .map((o) => o.codigoProducto)
          .filter((c): c is string => Boolean(c) && !mapeador.producto(c)),
      ),
    ];
    inicio = Date.now();
    const productosOrigen = await origen.productos(codigosFaltantes);
    registrarProgreso('productos faltantes extraídos', productosOrigen.length, inicio);
    inicio = Date.now();
    mapeador.altaProductos(productosOrigen);
    registrarProgreso('productos faltantes mapeados', productosOrigen.length, inicio);

    const ordenes: Record<string, unknown>[] = [];
    const contexto = new Map<
      number,
      { id: string; lineaId: string; maquinistaId: string; velocidadEstandar: number }
    >();
    inicio = Date.now();
    for (const fila of ordenesOrigen) {
      const mapeada = mapeador.orden(fila);
      if (!mapeada) continue;
      ordenes.push(mapeada.orden);
      contexto.set(fila.ofId, {
        id: mapeada.orden.id as string,
        lineaId: mapeada.orden.lineaId as string,
        maquinistaId: mapeada.orden.maquinistaId as string,
        velocidadEstandar: mapeada.orden.velocidadEstandar as number,
      });
    }
    registrarProgreso('órdenes mapeadas', `${ordenes.length}/${ordenesOrigen.length}`, inicio);

    const ofIds = [...contexto.keys()];
    const paradas: Record<string, unknown>[] = [];
    const mermas: Record<string, unknown>[] = [];
    const velocidades: Record<string, unknown>[] = [];
    const correlativos = new Map<string, number>();
    const siguiente = (clave: string): number => {
      const n = (correlativos.get(clave) ?? 0) + 1;
      correlativos.set(clave, n);
      return n;
    };

    /* `paradasCount` y `mermasKg` viven desnormalizados en la orden: se rellenan
     * mientras se mapean los hijos, para no recorrerlos dos veces. */
    const paradasPorOrden = new Map<string, number>();
    const paradasMinPorOrden = new Map<string, number>();
    const mermaKgPorOrden = new Map<string, number>();

    inicio = Date.now();
    const paradasOrigen = await origen.paradas(ofIds);
    registrarProgreso('paradas extraídas', paradasOrigen.length, inicio);
    inicio = Date.now();
    for (const fila of paradasOrigen) {
      const orden = contexto.get(fila.ofId);
      if (!orden) continue;
      const mapeada = mapeador.parada(fila, orden, siguiente(`P${orden.id}`));
      if (!mapeada) continue;
      paradas.push(mapeada);
      paradasPorOrden.set(orden.id, (paradasPorOrden.get(orden.id) ?? 0) + 1);
      if (mapeada.afectaOee) {
        paradasMinPorOrden.set(
          orden.id,
          (paradasMinPorOrden.get(orden.id) ?? 0) + (mapeada.duracionMin as number),
        );
      }
    }
    registrarProgreso('paradas mapeadas', `${paradas.length}/${paradasOrigen.length}`, inicio);

    inicio = Date.now();
    const mermasOrigen = await origen.mermas(ofIds);
    registrarProgreso('mermas extraídas', mermasOrigen.length, inicio);
    inicio = Date.now();
    for (const fila of mermasOrigen) {
      const orden = contexto.get(fila.ofId);
      if (!orden) continue;
      const mapeada = mapeador.merma(fila, orden, siguiente(`M${orden.id}`));
      if (!mapeada) continue;
      mermas.push(mapeada);
      mermaKgPorOrden.set(
        orden.id,
        (mermaKgPorOrden.get(orden.id) ?? 0) + (mapeada.cantidadKg as number),
      );
    }
    registrarProgreso('mermas mapeadas', `${mermas.length}/${mermasOrigen.length}`, inicio);

    inicio = Date.now();
    const velocidadesOrigen = await origen.velocidades(ofIds);
    registrarProgreso('velocidades extraídas', velocidadesOrigen.length, inicio);

    await origen.confirmarSnapshot();
    await origen.cerrar();
    console.log('  extracción terminada; conexión al origen cerrada');

    inicio = Date.now();
    for (const fila of velocidadesOrigen) {
      const orden = contexto.get(fila.ofId);
      if (!orden) continue;
      const mapeada = mapeador.velocidad(fila, orden, siguiente(`V${orden.id}`));
      if (mapeada) velocidades.push(mapeada);
    }
    registrarProgreso('velocidades mapeadas', `${velocidades.length}/${velocidadesOrigen.length}`, inicio);

    const ahora = ahoraIso();
    inicio = Date.now();
    for (const orden of ordenes) {
      const id = orden.id as string;
      const mermaKg = Math.round((mermaKgPorOrden.get(id) ?? 0) * 100) / 100;
      orden.paradasCount = paradasPorOrden.get(id) ?? 0;
      orden.mermasKg = mermaKg;
      mapeador.completarOee(orden, {
        paradasMin: paradasMinPorOrden.get(id) ?? 0,
        mermaKg,
        ahora,
      });
    }
    registrarProgreso('OEE de órdenes completado', ordenes.length, inicio);

    const altas = mapeador.altas();
    const datosValidacion: DatosValidacion = {
      desde,
      hasta,
      ordenesOrigen,
      ordenes,
      paradas,
      mermasOrigen,
      mermas,
      velocidades,
      altas,
    };
    const { verificaciones, errores } = validarMapeo(datosValidacion);

    /* ---------------- Escritura ---------------- */

    if (!simular) {
      await destino.transaction(async (gestor) => {
        /* Las detecciones IoT sembradas son eventos de la ventana que se
         * reemplaza: si se conservaran, «Tiempo real» seguiría proponiendo una
         * parada sugerida de hace semanas. El origen real, además, reporta los
         * sensores desconectados en las 9 líneas. */
        for (const [nombre, entidad] of [
          ['audit_event', AuditEvent],
          ['registro_velocidad', RegistroVelocidad],
          ['merma', Merma],
          ['parada', Parada],
          ['deteccion_iot', DeteccionIoT],
          ['orden_fabricacion', OrdenFabricacion],
        ] as const) {
          const inicioBorrado = Date.now();
          const resultado = await gestor.getRepository(entidad).createQueryBuilder().delete().execute();
          registrarProgreso(`borrado ${nombre}`, resultado.affected ?? 0, inicioBorrado);
        }

        /* Altas de catálogo: padres antes que hijos (el mapeador ya las encola
         * en ese orden). */
        for (const [nombre, entidad, filas] of [
          ['usuario', User, altas.usuariosNuevos],
          ['producto', Producto, altas.productosNuevos],
          ['causa_parada', CausaParada, altas.causasParadaNuevas],
          ['causa_merma', CausaMerma, altas.causasMermaNuevas],
          ['orden_fabricacion', OrdenFabricacion, ordenes],
          ['parada', Parada, paradas],
          ['merma', Merma, mermas],
          ['registro_velocidad', RegistroVelocidad, velocidades],
        ] as const) {
          const inicioInsercion = Date.now();
          const insertadas = await insertarEnLotes(gestor, entidad, [...filas]);
          registrarProgreso(`inserción ${nombre}`, insertadas, inicioInsercion);
        }

        const inicioVerificacion = Date.now();
        await verificarDestino(gestor, datosValidacion, verificaciones, errores);
        registrarProgreso('verificaciones dentro de la transacción', 5, inicioVerificacion);
      });
    } else if (errores.length > 0) {
      throw new Error(`Verificación fallida en simulación:\n- ${errores.join('\n- ')}`);
    }

    inicio = Date.now();
    const agregados = simular || sinAgregados
      ? null
      : await recalcularAgregados(destino, { costoMermaSolKg, dias: agregadosDias, hasta });
    if (agregados) registrarProgreso('agregados recalculados', agregadosDias, inicio);
    inicio = Date.now();
    const tiempos = simular || !tiemposTri ? null : await regenerarHojaTri(destino);
    if (tiempos) registrarProgreso('hoja TRI regenerada', tiempos.filas, inicio);

    /* ---------------- Informe ---------------- */

    console.log('Sincronizado');
    console.log(
      tabla([
        ['órdenes', `${ordenes.length} de ${ordenesOrigen.length} leídas`],
        ['paradas', paradas.length],
        ['mermas', mermas.length],
        ['lecturas de velocidad', velocidades.length],
      ]),
    );

    const nuevas =
      altas.usuariosNuevos.length +
      altas.productosNuevos.length +
      altas.causasParadaNuevas.length +
      altas.causasMermaNuevas.length;
    if (nuevas > 0) {
      console.log('\nAltas de catálogo (existían en el origen, no en el maestro del MES)');
      console.log(
        tabla([
          ['usuarios', altas.usuariosNuevos.map((u) => u.nombre).join(', ') || '—'],
          ['productos', altas.productosNuevos.map((p) => p.codigo).join(', ') || '—'],
          ['causas de parada', altas.causasParadaNuevas.map((c) => c.codigo).join(', ') || '—'],
          ['causas de merma', altas.causasMermaNuevas.map((c) => c.codigo).join(', ') || '—'],
        ]),
      );
    }

    if (agregados) {
      console.log(`\nAgregados de Reportes recalculados (últimos ${agregadosDias} días)`);
      console.log(
        tabla([
          ['días con OEE', agregados.dias],
          ['líneas', agregados.lineas],
          ['causas de parada', agregados.causasParada],
          ['causas de merma', agregados.causasMerma],
        ]),
      );
    }

    if (tiempos) {
      console.log('\nHoja de observación del TRI (Anexo 02) regenerada');
      console.log(
        tabla([
          ['eventos con intervalo medido', tiempos.filas],
          ['media', `${tiempos.mediaMin} min`],
          ['mediana', `${tiempos.medianaMin} min`],
        ]),
      );
    }

    const incidencias = incidenciasPorMotivoYMes(altas.incidencias);
    if (Object.keys(incidencias).length > 0) {
      console.log('\nIncidencias por motivo × mes');
      for (const [motivo, meses] of Object.entries(incidencias).sort((a, b) => a[0].localeCompare(b[0]))) {
        const desglose = Object.entries(meses)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([mes, cantidad]) => `${mes}: ${cantidad}`)
          .join(' · ');
        console.log(`  ${motivo}: ${desglose}`);
      }
    }

    if (simular) console.log('\nSimulación: no se escribió nada en el MES.');
    const comando = comandoActual();
    console.log(`\nComando: ${comando}`);

    if (rutaInforme) {
      const informe = {
        ventana: { desde, hasta, agregadosDias },
        comando,
        conteos: {
          ordenes: { leidas: ordenesOrigen.length, mapeadas: ordenes.length },
          paradas: { leidas: paradasOrigen.length, mapeadas: paradas.length },
          mermas: { leidas: mermasOrigen.length, mapeadas: mermas.length },
          velocidades: { leidas: velocidadesOrigen.length, mapeadas: velocidades.length },
        },
        incidencias,
        altas: {
          usuarios: altas.usuariosNuevos.map((usuario) => usuario.nombre),
          productos: altas.productosNuevos.map((producto) => producto.codigo),
          causasParada: altas.causasParadaNuevas.map((causa) => causa.codigo),
          causasMerma: altas.causasMermaNuevas.map((causa) => causa.codigo),
        },
        verificaciones,
      };
      const ruta = resolve(process.cwd(), rutaInforme);
      writeFileSync(ruta, `${JSON.stringify(informe, null, 2)}\n`, 'utf-8');
      console.log(`Informe JSON: ${ruta}`);
    }
  } finally {
    try {
      await origen.cerrar();
    } finally {
      if (destino.isInitialized) await destino.destroy();
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
