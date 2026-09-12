/**
 * Simulador del conteo de línea para demostraciones: `pnpm simular`.
 *
 * En la planta el conteo lo publican los sensores de cada línea, que hoy están
 * desconectados. Sin ese pulso, «Tiempo real» enseña tarjetas con 0 unidades y
 * barras vacías, y no se puede mostrar cómo se comporta la aplicación mientras
 * una línea produce. Este script genera ese pulso.
 *
 * Qué hace en cada tick (por defecto cada 5 s, el mismo refresco que la vista):
 *  - Recorre las líneas que tienen una **orden en curso del día operativo**. Una
 *    línea sin orden no cuenta nada, igual que en planta.
 *  - Si la orden tiene una **parada abierta**, no incrementa: la línea está
 *    detenida y lo coherente es que el contador se congele y la velocidad caiga.
 *  - Avanza el contador hacia el objetivo que corresponde al tiempo operativo
 *    transcurrido, con variación en cada lectura para que la cadencia no sea
 *    plana.
 *  - Cada cierto rato deja una lectura de velocidad, que es lo que la tarjeta
 *    muestra en «VELOCIDAD».
 *
 * El ritmo se calcula para que el OEE de la orden aterrice en el objetivo
 * (90 % por defecto): se parte de la disponibilidad y la calidad que ya tiene la
 * orden y se despeja el desempeño que hace falta, acotado a una banda creíble.
 *
 * **Sobre los datos que toca.** Escribe en las mismas columnas que alimentaría
 * el sensor (`producido`, `conteoCodificadora`, `oee` y `registro_velocidad`),
 * así que la vista se comporta igual que con un sensor real. Antes de modificar
 * una orden guarda sus valores originales en `data/simulacion-sensores.json`
 * (fuera de la base y fuera del repositorio), de modo que `--revertir` deja todo
 * como estaba. Conviene revertir antes de volver a usar los datos sincronizados
 * para cualquier cálculo que tenga que ser real.
 *
 * Opciones:
 *   --intervalo=5        segundos entre lecturas
 *   --oee=90             OEE objetivo en %
 *   --avance=30          % del plan en el que arranca cada línea
 *   --sin-paradas        aparta las paradas de la orden durante la demostración
 *   --dia=YYYY-MM-DD     día operativo a simular (por defecto, el de las órdenes en curso)
 *   --una-vez            hace una sola lectura y termina
 *   --revertir           restaura los valores originales y borra lo que creó
 *   --destino=postgres://…   base del MES (por defecto DATABASE_URL)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { computeOee, finDeTurno, inicioDeTurno } from '@mes/shared';
import type { OeeDetalle } from '@mes/types';
import { ahoraIso } from '../src/common/utils';
import { crearDataSource } from '../src/database/data-source';
import {
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
  RegistroVelocidad,
} from '../src/database/entities';

const INTERVALO_POR_DEFECTO = 5;
const OEE_OBJETIVO_POR_DEFECTO = 90;

/** Banda de desempeño creíble: fuera de aquí el ritmo delataría el cálculo. */
const DESEMPENO_MIN = 0.82;
const DESEMPENO_MAX = 1.06;

/** Amplitud del vaivén del ritmo, como fracción del desempeño objetivo. */
const VAIVEN = 0.03;

/**
 * Techo instantáneo del contador, como múltiplo de la velocidad estándar. Una
 * línea puede ir algo por encima del estándar, nunca al triple: este tope evita
 * que un hueco entre lecturas (la máquina suspendida, por ejemplo) se traduzca
 * en un salto imposible.
 */
const FACTOR_RITMO_MAXIMO = 1.15;

/** Tope de producción sobre el plan; en planta se pasa un poco, no muchísimo. */
const FACTOR_TOPE_PLAN = 1.03;

/** Minutos entre lecturas de velocidad guardadas. */
const MINUTOS_ENTRE_LECTURAS = 18;

/**
 * Porcentaje del plan en el que arranca cada línea. Bajo a propósito: cuanto
 * antes empiece, más rato tarda la orden en llegar a su plan y más dura la
 * demostración antes de que la línea tenga que encadenar con la siguiente.
 */
const AVANCE_INICIAL_PCT = 30;

const ARCHIVO_ESTADO = resolve(process.cwd(), 'data', 'simulacion-sensores.json');

/** Vaivén del ritmo por orden; vive sólo mientras corre el proceso. */
const vaivenes = new Map<string, number>();

/**
 * Contador exacto por orden, en decimales. La orden guarda unidades enteras,
 * pero una línea lenta produce menos de una unidad entre lectura y lectura: sin
 * llevar el resto aparte, el redondeo de cada tick acabaría desviando el ritmo
 * medio. Vive en memoria; al arrancar se siembra con lo que ya tiene la orden.
 */
const contadores = new Map<string, number>();

interface ParadaGuardada {
  inicio: string;
  fin: string | null;
}

interface Baseline {
  producido: number;
  conteoCodificadora: number;
  oee: OeeDetalle;
  /** Estado y cierre originales; cambian cuando el simulador encadena órdenes. */
  estado?: string;
  fin?: string | null;
  /** `true` si fue el simulador quien puso la orden en curso. */
  arrancada?: boolean;
  /** Ids de las lecturas de velocidad creadas, para poder borrarlas. */
  velocidades: string[];
  /** Ritmo asignado a esta orden; se conserva para que no cambie en cada tick. */
  desempenoObjetivo: number;
  /** Marca de inicio original, si la orden se reancló. */
  inicio?: string;
  /** Horas originales de las paradas y mermas desplazadas, por id. */
  paradas?: Record<string, ParadaGuardada>;
  mermas?: Record<string, string>;
  /** Paradas retiradas con `--sin-paradas`, enteras, para poder devolverlas. */
  paradasRetiradas?: Parada[];
}

type Estado = Record<string, Baseline>;

function leerEstado(): Estado {
  if (!existsSync(ARCHIVO_ESTADO)) return {};
  return JSON.parse(readFileSync(ARCHIVO_ESTADO, 'utf-8')) as Estado;
}

function guardarEstado(estado: Estado): void {
  mkdirSync(dirname(ARCHIVO_ESTADO), { recursive: true });
  writeFileSync(ARCHIVO_ESTADO, JSON.stringify(estado, null, 2));
}

function opcion(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}

function bandera(nombre: string): boolean {
  return process.argv.includes(`--${nombre}`);
}

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
    if (!(clave in process.env)) {
      process.env[clave] = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}

function minutosEntre(desde: string, hasta: string): number {
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / 60_000;
}

function redondear(valor: number, decimales = 1): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/** Ruido multiplicativo centrado en 1. */
function jitter(amplitud: number): number {
  return 1 + (Math.random() * 2 - 1) * amplitud;
}

interface Contexto {
  orden: OrdenFabricacion;
  paradas: Parada[];
  mermaKg: number;
  pesoKg: number;
  velocidades: RegistroVelocidad[];
}

/** Suma minutos a una marca `YYYY-MM-DDTHH:MM:SS` sin salirse del formato local. */
function sumarMinutos(iso: string, minutos: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutos);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Ventana de orden que deja el OEE lo más cerca posible del objetivo.
 *
 * El OEE depende de dos cosas que tiran en sentidos contrarios: cuanto más
 * estrecha es la ventana, mejor sale el desempeño pero peor la disponibilidad,
 * porque los minutos de parada pesan más. En vez de despejarlo a mano se barre
 * el rango de ventanas posibles y se elige la mejor; son unos cientos de
 * iteraciones triviales y se lee de un vistazo.
 */
function mejorVentana(
  producido: number,
  velocidad: number,
  minutosParada: number,
  calidad: number,
  oeeObjetivo: number,
  maximoDisponible: number,
): { operativos: number; desempeno: number } | null {
  let mejor: { operativos: number; desempeno: number; error: number } | null = null;
  const tope = Math.max(1, Math.floor(maximoDisponible - minutosParada));
  for (let operativos = 1; operativos <= tope; operativos += 1) {
    const desempeno = producido / (operativos * velocidad);
    if (desempeno < DESEMPENO_MIN || desempeno > DESEMPENO_MAX) continue;
    const disponibilidad = operativos / (operativos + minutosParada);
    const oee = disponibilidad * desempeno * (calidad / 100) * 100;
    const error = Math.abs(oee - oeeObjetivo);
    if (!mejor || error < mejor.error) mejor = { operativos, desempeno, error };
  }
  return mejor ? { operativos: mejor.operativos, desempeno: mejor.desempeno } : null;
}

/**
 * Desempeño que hace falta para que el OEE de la orden llegue al objetivo,
 * partiendo de la disponibilidad y la calidad que ya tiene. Se acota a una banda
 * creíble: con muchas paradas el desempeño necesario se dispararía y el ritmo
 * resultante no se sostendría en una línea real.
 */
function desempenoNecesario(disponibilidad: number, calidad: number, oeeObjetivo: number): number {
  const base = (disponibilidad / 100) * (calidad / 100);
  if (base <= 0) return DESEMPENO_MAX;
  const necesario = oeeObjetivo / 100 / base;
  return Math.min(DESEMPENO_MAX, Math.max(DESEMPENO_MIN, necesario));
}

async function contextoDe(ds: DataSource, orden: OrdenFabricacion): Promise<Contexto> {
  const paradas = await ds.getRepository(Parada).find({ where: { ordenId: orden.id } });
  const mermas = await ds.getRepository(Merma).find({ where: { ordenId: orden.id } });
  const producto = await ds.getRepository(Producto).findOne({ where: { id: orden.productoId } });
  const velocidades = await ds
    .getRepository(RegistroVelocidad)
    .find({ where: { ordenId: orden.id } });
  return {
    orden,
    paradas,
    mermaKg: mermas.reduce((total, m) => total + m.cantidadKg, 0),
    pesoKg: producto?.pesoKg ?? 0,
    velocidades,
  };
}

/**
 * Deja la orden lista para la demostración.
 *
 * Las órdenes que llegan del sistema real vienen de una jornada ya avanzada: su
 * plan se completa en una fracción del turno y nadie las cerró, así que el
 * reloj sigue corriendo sobre una ventana enorme y el desempeño se hunde. Aquí
 * se recoloca la orden sobre el momento actual: se calcula cuánta ventana
 * necesita para el avance pedido al OEE objetivo y se desplaza `inicio` —y con
 * él sus paradas y mermas, el mismo número de minutos— para que la cronología
 * del turno siga cuadrando.
 *
 * Devuelve `true` si movió la orden. Los valores originales quedan en el
 * registro de la simulación para que `--revertir` los restaure.
 */
async function reanclar(
  ds: DataSource,
  ctx: Contexto,
  base: Baseline,
  oeeObjetivo: number,
  avancePct: number,
  unidadesMermadas: number,
  sinParadas: boolean,
): Promise<boolean> {
  const { orden } = ctx;
  const ahora = ahoraIso();

  /* Una orden que arrancó el propio simulador ya nace en su sitio: empieza en
   * cero y a partir de ahí cuenta, que es lo que hace una orden recién abierta. */
  if (base.arrancada) return false;

  /* Una orden cuyo plan vale menos tiempo del que ya perdió en paradas no puede
   * enseñar un OEE sano por mucho que cuente el sensor. `--sin-paradas` las
   * retira mientras dura la demostración; `--revertir` las devuelve intactas. */
  if (sinParadas && ctx.paradas.length > 0) {
    base.paradasRetiradas = ctx.paradas.map((p) => ({ ...p }));
    await ds.getRepository(Parada).remove(ctx.paradas.map((p) => ({ ...p }) as Parada));
    ctx.paradas = [];
    orden.paradasCount = 0;
  }
  const arranqueTurno = inicioDeTurno(orden.fecha, orden.turno);
  const disponible = minutosEntre(arranqueTurno, ahora);
  if (disponible <= 0) return false;

  const minutosParada = ctx.paradas
    .filter((p) => p.afectaOee)
    .reduce((total, p) => total + p.duracionMin, 0);
  const producido = Math.round(orden.planificado * (avancePct / 100) * jitter(0.06));
  const calidad =
    producido > 0 ? (Math.max(0, producido - unidadesMermadas) / producido) * 100 : 100;

  const ventana = mejorVentana(
    producido,
    orden.velocidadEstandar,
    minutosParada,
    calidad,
    oeeObjetivo,
    disponible,
  );
  if (!ventana) return false;

  const nuevoInicio = sumarMinutos(ahora, -(ventana.operativos + minutosParada));
  const delta = Math.round(minutosEntre(orden.inicio, nuevoInicio) || -minutosEntre(nuevoInicio, orden.inicio));

  base.inicio = orden.inicio;
  base.paradas = {};
  base.mermas = {};

  /* Paradas y mermas se mueven el mismo número de minutos: conservan su posición
   * relativa dentro de la orden, que es lo que hace creíble la cronología. */
  const repoParadas = ds.getRepository(Parada);
  for (const parada of ctx.paradas) {
    base.paradas[parada.id] = { inicio: parada.inicio, fin: parada.fin };
    parada.inicio = sumarMinutos(parada.inicio, delta);
    if (parada.fin) parada.fin = sumarMinutos(parada.fin, delta);
    await repoParadas.save(parada);
  }
  const repoMermas = ds.getRepository(Merma);
  for (const merma of await repoMermas.find({ where: { ordenId: orden.id } })) {
    base.mermas[merma.id] = merma.registradaEn;
    merma.registradaEn = sumarMinutos(merma.registradaEn, delta);
    await repoMermas.save(merma);
  }

  orden.inicio = nuevoInicio;
  orden.producido = producido;
  orden.conteoCodificadora = Math.round(producido * (0.995 + Math.random() * 0.006));
  base.desempenoObjetivo = ventana.desempeno;
  return true;
}

/**
 * Cierra la orden cuando alcanza su plan y pone en curso la siguiente de la
 * misma línea y jornada, si la hay.
 *
 * Es lo que hace la línea: termina la OF, el maquinista la deja por validar y
 * arranca la siguiente. Sin esto el contador se quedaría clavado en el plan y la
 * demostración se apagaría en cuanto la primera orden llegara al tope.
 *
 * Las candidatas son las órdenes `incompleta` del día en esa línea, que son las
 * que el sistema real dejó abiertas sin cerrar. Si no queda ninguna, la línea
 * pasa a «Sin orden», que es como acaba un turno.
 */
async function encadenar(
  ds: DataSource,
  orden: OrdenFabricacion,
  estado: Estado,
): Promise<string | null> {
  const ahora = ahoraIso();
  const ordenes = ds.getRepository(OrdenFabricacion);

  const base = estado[orden.id];
  base.estado ??= orden.estado;
  base.fin ??= orden.fin;
  orden.estado = 'por_validar';
  orden.fin = ahora;
  await ordenes.save(orden);

  const candidatas = await ordenes.find({
    where: { lineaId: orden.lineaId, fecha: orden.fecha, estado: 'incompleta' },
  });
  const siguiente = candidatas
    .filter((o) => !estado[o.id])
    .sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  if (!siguiente) return `${etiquetaLinea(orden)} ${orden.codigo}  cerrada · sin más órdenes`;

  estado[siguiente.id] = {
    producido: siguiente.producido,
    conteoCodificadora: siguiente.conteoCodificadora,
    oee: { ...siguiente.oee },
    estado: siguiente.estado,
    fin: siguiente.fin,
    arrancada: true,
    velocidades: [],
    desempenoObjetivo: 0.92,
  };
  siguiente.estado = 'en_curso';
  siguiente.inicio = ahora;
  siguiente.fin = null;
  siguiente.producido = 0;
  siguiente.conteoCodificadora = 0;
  siguiente.oee = { oee: 0, disponibilidad: 100, desempeno: 0, calidad: 100 };
  await ordenes.save(siguiente);
  contadores.delete(siguiente.id);

  return `${etiquetaLinea(orden)} ${orden.codigo}  cerrada  →  arranca ${siguiente.codigo}`;
}

function etiquetaLinea(orden: OrdenFabricacion): string {
  return orden.lineaId.replace('LIN-', '').padEnd(9);
}

/** Una lectura del "sensor" para una orden. Devuelve el texto del informe. */
async function pulso(
  ds: DataSource,
  ctx: Contexto,
  estado: Estado,
  oeeObjetivo: number,
  avancePct: number,
  sinParadas: boolean,
  segundosTick: number,
): Promise<string | null> {
  const { orden } = ctx;
  const ahora = ahoraIso();

  const paradaAbierta = ctx.paradas.find((p) => p.fin === null);
  /* El turno acota el reloj: una orden que nadie cerró no puede seguir sumando
   * horas indefinidamente, igual que no lo haría el contador de la línea. */
  const cierre = finDeTurno(orden.fecha, orden.turno);
  const hasta = ahora < cierre ? ahora : cierre;
  const minutosParada = ctx.paradas
    .filter((p) => p.afectaOee)
    .reduce((total, p) => total + (p.fin ? p.duracionMin : minutosEntre(p.inicio, hasta)), 0);
  const minutosTurno = minutosEntre(orden.inicio, hasta);
  const minutosOperativos = Math.max(0, minutosTurno - minutosParada);

  const disponibilidad = minutosTurno > 0 ? (minutosOperativos / minutosTurno) * 100 : 100;
  const unidadesMermadas = ctx.pesoKg > 0 ? Math.round(ctx.mermaKg / ctx.pesoKg) : 0;

  let base = estado[orden.id];
  let alineacion = false;

  if (!base) {
    base = {
      producido: orden.producido,
      conteoCodificadora: orden.conteoCodificadora,
      oee: { ...orden.oee },
      velocidades: [],
      desempenoObjetivo: desempenoNecesario(
        disponibilidad,
        orden.oee?.calidad || 98,
        oeeObjetivo,
      ),
    };
    estado[orden.id] = base;
    alineacion = await reanclar(ds, ctx, base, oeeObjetivo, avancePct, unidadesMermadas, sinParadas);
  }

  /* Vaivén suave del ritmo: una línea no va exactamente al mismo paso minuto a
   * minuto, pero tampoco da tumbos. El paseo se ancla al objetivo para que la
   * media no se desplace. */
  const vaiven = vaivenes.get(orden.id) ?? 1;
  const siguienteVaiven = Math.min(
    1 + VAIVEN,
    Math.max(1 - VAIVEN, vaiven + (Math.random() - 0.5) * VAIVEN * 0.4 + (1 - vaiven) * 0.1),
  );
  vaivenes.set(orden.id, siguienteVaiven);

  if (base.arrancada && base.desempenoObjetivo === 0.92) {
    base.desempenoObjetivo = desempenoNecesario(100, 98, oeeObjetivo) * jitter(0.02);
  }
  const desempenoObjetivo = base.desempenoObjetivo;
  const tope = Math.round(orden.planificado * FACTOR_TOPE_PLAN);

  /* El contador avanza sumando lo producido en los segundos transcurridos, no
   * recalculando un total absoluto: así el vaivén del ritmo no puede dejar la
   * meta por debajo de lo ya contado y congelar la línea. */
  const previo = contadores.get(orden.id) ?? orden.producido;
  const avance = alineacion
    ? 0
    : (orden.velocidadEstandar * desempenoObjetivo * siguienteVaiven * segundosTick) / 60;
  const exacto = Math.min(tope, (alineacion ? orden.producido : previo) + avance);
  contadores.set(orden.id, exacto);
  const meta = Math.round(exacto);

  /* Tras el reanclaje la ventana se recalcula: `inicio` ha cambiado. */
  const cierre2 = finDeTurno(orden.fecha, orden.turno);
  const hasta2 = ahora < cierre2 ? ahora : cierre2;
  const paradaMin2 = ctx.paradas
    .filter((p) => p.afectaOee)
    .reduce((total, p) => total + (p.fin ? p.duracionMin : minutosEntre(p.inicio, hasta2)), 0);

  /* Con la línea parada el contador se congela: es lo que haría el sensor. */
  if (paradaAbierta && !alineacion) return null;

  /* El contador **sigue** al objetivo en vez de perseguirlo a saltos: así el
   * ritmo medio es exactamente el que marca el desempeño y no deriva. El techo
   * sólo actúa si hubo un hueco entre lecturas (la máquina suspendida), para
   * que no aparezca un salto que ningún contador real daría. */
  const techo = Math.ceil((orden.velocidadEstandar * FACTOR_RITMO_MAXIMO * segundosTick) / 60);
  const siguiente = Math.min(meta, orden.producido + techo);
  const incremento = alineacion ? 0 : Math.max(0, siguiente - orden.producido);
  if (incremento === 0 && !alineacion) return null;

  orden.producido += incremento;
  /* La codificadora va ligeramente por detrás del contador de línea. */
  orden.conteoCodificadora = Math.round(orden.producido * (0.995 + Math.random() * 0.006));

  const unidadesBuenas = Math.max(0, orden.producido - unidadesMermadas);
  orden.oee = computeOee({
    tiempoPlanificadoMin: Math.round(minutosEntre(orden.inicio, hasta2)),
    paradasMin: Math.round(paradaMin2),
    unidadesProducidas: orden.producido,
    unidadesBuenas,
    velocidadEstandar: orden.velocidadEstandar,
  });
  await ds.getRepository(OrdenFabricacion).save(orden);

  if (paradaAbierta) return null;

  /* Lectura de velocidad cada tanto, como el registro periódico de la línea. */
  const ultima = ctx.velocidades
    .map((v) => v.registradaEn)
    .sort()
    .at(-1);
  if (!ultima || minutosEntre(ultima, ahora) >= MINUTOS_ENTRE_LECTURAS * jitter(0.25)) {
    const velocidadReal = redondear(
      orden.velocidadEstandar * desempenoObjetivo * siguienteVaiven * jitter(0.02),
      2,
    );
    const correlativo = ctx.velocidades.length + 1;
    const registro = ds.getRepository(RegistroVelocidad).create({
      id: `VEL-${orden.id.replace('ORD-', '')}-${String(correlativo).padStart(2, '0')}`,
      ordenId: orden.id,
      lineaId: orden.lineaId,
      registradaEn: ahora,
      velocidadReal,
      velocidadEstandar: orden.velocidadEstandar,
      desvioPct: redondear(
        ((velocidadReal - orden.velocidadEstandar) / orden.velocidadEstandar) * 100,
      ),
      motivo: null,
      responsableId: orden.maquinistaId,
      tiempoRegistroSeg: 1 + Math.round(Math.random() * 2),
    });
    await ds.getRepository(RegistroVelocidad).save(registro);
    ctx.velocidades.push(registro);
    base.velocidades.push(registro.id);
  }

  const etiqueta = alineacion ? 'arranque demo' : `+${incremento.toString().padStart(5)} u`;
  const linea = `${etiquetaLinea(orden)} ${orden.codigo}  ${etiqueta.padStart(13)}  →  ${orden.producido.toLocaleString('es-PE').padStart(9)} / ${orden.planificado.toLocaleString('es-PE')}  ·  OEE ${orden.oee.oee.toFixed(1)} %`;

  /* Alcanzado el plan, la OF se cierra y entra la siguiente de la línea. */
  if (orden.producido >= orden.planificado) {
    const relevo = await encadenar(ds, orden, estado);
    return relevo ? `${linea}\n${' '.repeat(10)}${relevo}` : linea;
  }
  return linea;
}

async function revertir(ds: DataSource): Promise<void> {
  const estado = leerEstado();
  const ids = Object.keys(estado);
  if (ids.length === 0) {
    console.log('No hay nada que revertir.');
    return;
  }
  const ordenes = ds.getRepository(OrdenFabricacion);
  const velocidades = ds.getRepository(RegistroVelocidad);
  const repoParadas = ds.getRepository(Parada);
  const repoMermas = ds.getRepository(Merma);
  let lecturas = 0;
  let eventos = 0;
  for (const [ordenId, base] of Object.entries(estado)) {
    const orden = await ordenes.findOne({ where: { id: ordenId } });
    if (orden) {
      orden.producido = base.producido;
      orden.conteoCodificadora = base.conteoCodificadora;
      orden.oee = base.oee;
      if (base.inicio) orden.inicio = base.inicio;
      if (base.estado) orden.estado = base.estado as OrdenFabricacion['estado'];
      if (base.fin !== undefined) orden.fin = base.fin;
      await ordenes.save(orden);
    }
    if (base.paradasRetiradas?.length) {
      await repoParadas.insert(base.paradasRetiradas);
      eventos += base.paradasRetiradas.length;
      if (orden) {
        orden.paradasCount = base.paradasRetiradas.length;
        await ordenes.save(orden);
      }
    }
    for (const [id, horas] of Object.entries(base.paradas ?? {})) {
      await repoParadas.update({ id }, { inicio: horas.inicio, fin: horas.fin });
      eventos += 1;
    }
    for (const [id, registradaEn] of Object.entries(base.mermas ?? {})) {
      await repoMermas.update({ id }, { registradaEn });
      eventos += 1;
    }
    for (const id of base.velocidades) {
      await velocidades.delete({ id });
      lecturas += 1;
    }
  }
  writeFileSync(ARCHIVO_ESTADO, JSON.stringify({}, null, 2));
  console.log(
    `Restauradas ${ids.length} órdenes y ${eventos} eventos; borradas ${lecturas} lecturas de velocidad.`,
  );
}

async function main(): Promise<void> {
  cargarEnv();
  const urlDestino = opcion('destino') ?? process.env.DATABASE_URL;
  if (!urlDestino) {
    throw new Error('Falta la base del MES: define DATABASE_URL en apps/api/.env o usa --destino=…');
  }

  const ds = crearDataSource({ databaseUrl: urlDestino });
  await ds.initialize();

  try {
    if (bandera('revertir')) {
      await revertir(ds);
      return;
    }

    const intervalo = Number(opcion('intervalo') ?? INTERVALO_POR_DEFECTO) * 1000;
    const oeeObjetivo = Number(opcion('oee') ?? OEE_OBJETIVO_POR_DEFECTO);
    const avancePct = Number(opcion('avance') ?? AVANCE_INICIAL_PCT);
    const sinParadas = bandera('sin-paradas');
    const dia = opcion('dia');
    const unaVez = bandera('una-vez');

    const estado = leerEstado();
    console.log(
      `Conteo de línea · OEE objetivo ${oeeObjetivo} % · lectura cada ${intervalo / 1000} s` +
        (unaVez ? ' · una sola lectura' : ' · Ctrl+C para parar'),
    );

    let anterior = Date.now();
    const tick = async (): Promise<void> => {
      const ahoraMs = Date.now();
      const segundosTick = Math.max(1, Math.round((ahoraMs - anterior) / 1000)) || intervalo / 1000;
      anterior = ahoraMs;
      const abiertas = await ds.getRepository(OrdenFabricacion).find({ where: { estado: 'en_curso' } });
      const delDia = dia ? abiertas.filter((o) => o.fecha === dia) : abiertas;
      if (delDia.length === 0) {
        console.log('Ninguna línea tiene orden en curso.');
        return;
      }
      for (const orden of delDia) {
        const linea = await pulso(
          ds,
          await contextoDe(ds, orden),
          estado,
          oeeObjetivo,
          avancePct,
          sinParadas,
          segundosTick,
        );
        if (linea) console.log(`${ahoraIso().slice(11)}  ${linea}`);
      }
      guardarEstado(estado);
    };

    await tick();
    if (unaVez) return;

    await new Promise<void>((resolver) => {
      const temporizador = setInterval(() => {
        void tick().catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : error);
        });
      }, intervalo);
      const parar = (): void => {
        clearInterval(temporizador);
        console.log('\nConteo detenido.');
        resolver();
      };
      process.on('SIGINT', parar);
      process.on('SIGTERM', parar);
    });
  } finally {
    await ds.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
