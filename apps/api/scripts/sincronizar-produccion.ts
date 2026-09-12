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
 *   --sin-agregados           no recalcular las tablas de Reportes
 *   --tiempos-tri             vuelca los eventos importados en la hoja de
 *                             observación del TRI (Anexo 02). Desactivado por
 *                             defecto: ver `sincronizacion/tiempos.ts`
 *   --simular                 lee y mapea, pero no escribe nada (dry run)
 */
import { existsSync, readFileSync } from 'node:fs';
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

const TAMANO_LOTE = 500;
const DIAS_POR_DEFECTO = 30;
const COSTO_MERMA_POR_DEFECTO = 9.5;

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
): Promise<void> {
  for (const lote of trocear(filas, TAMANO_LOTE)) {
    await gestor.getRepository(entidad as never).insert(lote as never);
  }
}

function tabla(filas: [string, string | number][]): string {
  const ancho = Math.max(...filas.map(([k]) => k.length));
  return filas.map(([k, v]) => `  ${k.padEnd(ancho)}  ${v}`).join('\n');
}

async function main(): Promise<void> {
  cargarEnv();

  const simular = bandera('simular');
  const sinAgregados = bandera('sin-agregados');
  const tiemposTri = bandera('tiempos-tri');
  const costoMermaSolKg = Number(opcion('costo-merma') ?? COSTO_MERMA_POR_DEFECTO);
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
  await destino.initialize();

  try {
    const hasta = opcion('hasta') ?? (await origen.fechaDelServidor());
    const desde = opcion('desde') ?? restarDias(hasta, Number(opcion('dias') ?? DIAS_POR_DEFECTO) - 1);
    console.log(`  ventana ${desde} → ${hasta}${simular ? '  (simulación, no escribe)' : ''}\n`);

    /* ---------------- Lectura y mapeo ---------------- */

    const mapeador = await Mapeador.cargar(destino);
    const ordenesOrigen = await origen.ordenes(desde, hasta);

    const codigosFaltantes = [
      ...new Set(
        ordenesOrigen
          .map((o) => o.codigoProducto)
          .filter((c): c is string => Boolean(c) && !mapeador.producto(c)),
      ),
    ];
    mapeador.altaProductos(await origen.productos(codigosFaltantes));

    const ordenes: Record<string, unknown>[] = [];
    const contexto = new Map<
      number,
      { id: string; lineaId: string; maquinistaId: string; velocidadEstandar: number }
    >();
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

    for (const fila of await origen.paradas(ofIds)) {
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

    for (const fila of await origen.mermas(ofIds)) {
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

    for (const fila of await origen.velocidades(ofIds)) {
      const orden = contexto.get(fila.ofId);
      if (!orden) continue;
      const mapeada = mapeador.velocidad(fila, orden, siguiente(`V${orden.id}`));
      if (mapeada) velocidades.push(mapeada);
    }

    const ahora = ahoraIso();
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

    const altas = mapeador.altas();

    /* ---------------- Escritura ---------------- */

    if (!simular) {
      await destino.transaction(async (gestor) => {
        /* Las detecciones IoT sembradas son eventos de la ventana que se
         * reemplaza: si se conservaran, «Tiempo real» seguiría proponiendo una
         * parada sugerida de hace semanas. El origen real, además, reporta los
         * sensores desconectados en las 9 líneas. */
        for (const entidad of [
          AuditEvent,
          RegistroVelocidad,
          Merma,
          Parada,
          DeteccionIoT,
          OrdenFabricacion,
        ]) {
          await gestor.getRepository(entidad).createQueryBuilder().delete().execute();
        }

        /* Altas de catálogo: padres antes que hijos (el mapeador ya las encola
         * en ese orden). */
        if (altas.usuariosNuevos.length) await insertarEnLotes(gestor, User, altas.usuariosNuevos);
        if (altas.productosNuevos.length)
          await insertarEnLotes(gestor, Producto, altas.productosNuevos);
        for (const causa of altas.causasParadaNuevas) await gestor.getRepository(CausaParada).insert(causa);
        for (const causa of altas.causasMermaNuevas) await gestor.getRepository(CausaMerma).insert(causa);

        await insertarEnLotes(gestor, OrdenFabricacion, ordenes);
        await insertarEnLotes(gestor, Parada, paradas);
        await insertarEnLotes(gestor, Merma, mermas);
        await insertarEnLotes(gestor, RegistroVelocidad, velocidades);
      });
    }

    const agregados =
      simular || sinAgregados ? null : await recalcularAgregados(destino, { costoMermaSolKg });
    const tiempos = simular || !tiemposTri ? null : await regenerarHojaTri(destino);

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
      console.log('\nAgregados de Reportes recalculados');
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

    if (altas.incidencias.length > 0) {
      const porMotivo = new Map<string, string[]>();
      for (const { motivo, detalle } of altas.incidencias) {
        const lista = porMotivo.get(motivo) ?? [];
        lista.push(detalle);
        porMotivo.set(motivo, lista);
      }
      console.log('\nDescartado (el MES no puede representarlo)');
      for (const [motivo, detalles] of [...porMotivo].sort((a, b) => b[1].length - a[1].length)) {
        const muestra = [...new Set(detalles)].slice(0, 3).join(' · ');
        console.log(`  ${detalles.length.toString().padStart(4)}  ${motivo}: ${muestra}${detalles.length > 3 ? ' …' : ''}`);
      }
    }

    if (simular) console.log('\nSimulación: no se escribió nada en el MES.');
  } finally {
    await origen.cerrar();
    await destino.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
