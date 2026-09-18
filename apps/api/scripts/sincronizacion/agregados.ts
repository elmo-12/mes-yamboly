/**
 * Recálculo de los agregados que alimentan **Reportes** (`/reportes`) a partir
 * de las órdenes, paradas y mermas ya sincronizadas.
 *
 * `ReportsService` no consulta las tablas transaccionales: lee ocho tablas
 * pre-agregadas (`indicador_diario`, `indicador_linea`, `indicador_turno`,
 * `indicador_kpi`, `parada_agregada`, `parada_categoria`, `merma_agregada`,
 * `merma_causa`). Si sólo se sincronizaran las órdenes, Reportes seguiría
 * mostrando los números sembrados, así que este módulo las reconstruye enteras.
 *
 * Las comparaciones "vs periodo anterior" que muestra la UI se calculan dentro
 * de la propia ventana sincronizada: **últimos 7 días frente a los 7 previos**.
 * No hay dato del año anterior, así que `deltaAnioValor` queda en `null` y la
 * UI simplemente no pinta esa comparación.
 */
import { In, MoreThanOrEqual, type DataSource } from 'typeorm';
import { computeOee } from '@mes/shared';
import type { TipoMermaCodigo, Turno as TurnoCodigo } from '@mes/types';
import { ahoraIso } from '../../src/common/utils';
import {
  CausaMerma,
  CausaParada,
  IndicadorDiario,
  IndicadorKpi,
  IndicadorLinea,
  IndicadorTurno,
  Linea,
  Merma,
  MermaAgregada,
  MermaCausa,
  OrdenFabricacion,
  Parada,
  ParadaAgregada,
  ParadaCategoria,
  Producto,
} from '../../src/database/entities';
import type { CategoriaParada } from '../../src/database/entities/parada-agregada.entity';

/** Meta de OEE de la tesis. */
const META_OEE = 85;

/** Días de la ventana corta con la que se calculan los deltas "vs periodo anterior". */
const DIAS_DELTA = 7;

const ETIQUETA_TURNO: Record<TurnoCodigo, string> = { D: 'Día', N: 'Noche' };

const ETIQUETA_CATEGORIA: Record<CategoriaParada, string> = {
  rutinarias: 'Rutinarias',
  imprevistas: 'Imprevistas',
  fallas: 'Fallas',
};

export interface OpcionesAgregados {
  /** Coste unitario con el que se valoriza la merma en el KPI de Reportes (S/ por kg). */
  costoMermaSolKg: number;
  /** Días más recientes que alimentan la foto pre-agregada de Reportes. */
  dias: number;
  /** Último día de la ventana sincronizada (`YYYY-MM-DD`). */
  hasta: string;
}

function redondear(valor: number, decimales = 1): number {
  if (!Number.isFinite(valor)) return 0;
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

function minutosEntre(desde: string, hasta: string): number {
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60_000);
}

/** Minutos de la orden: hasta su cierre, o hasta «ahora» si sigue abierta. */
function minutosDeOrden(orden: OrdenFabricacion, ahora: string): number {
  return minutosEntre(orden.inicio, orden.fin ?? ahora);
}

/** Categoría de Reportes según el tipo raíz del árbol de causas de parada. */
function categoriaDeTipo(tipo: CausaParada | undefined): CategoriaParada {
  if (!tipo) return 'imprevistas';
  if (tipo.clasificacion === 'programada') return 'rutinarias';
  return /falla/i.test(tipo.nombre) ? 'fallas' : 'imprevistas';
}

interface Acumulado {
  tiempoPlanificadoMin: number;
  paradasMin: number;
  unidadesProducidas: number;
  unidadesBuenas: number;
  /** Acumulador para promediar la velocidad estándar ponderada por tiempo. */
  velocidadPonderada: number;
}

function nuevoAcumulado(): Acumulado {
  return {
    tiempoPlanificadoMin: 0,
    paradasMin: 0,
    unidadesProducidas: 0,
    unidadesBuenas: 0,
    velocidadPonderada: 0,
  };
}

function velocidadMedia(a: Acumulado): number {
  return a.tiempoPlanificadoMin > 0 ? a.velocidadPonderada / a.tiempoPlanificadoMin : 0;
}

function oeeDe(a: Acumulado) {
  return computeOee({
    tiempoPlanificadoMin: a.tiempoPlanificadoMin,
    paradasMin: a.paradasMin,
    unidadesProducidas: a.unidadesProducidas,
    unidadesBuenas: a.unidadesBuenas,
    velocidadEstandar: velocidadMedia(a),
  });
}

/** Suma en `destino` la aportación de una orden y sus paradas con impacto OEE. */
function acumular(destino: Acumulado, minutos: number, paradasMin: number, orden: OrdenFabricacion): void {
  destino.tiempoPlanificadoMin += minutos;
  destino.paradasMin += paradasMin;
  destino.unidadesProducidas += orden.producido;
  /* La calidad real de la orden viene del sistema de planta; se traduce a
   * unidades buenas para que `computeOee` reproduzca ese mismo porcentaje. */
  destino.unidadesBuenas += Math.round(orden.producido * ((orden.oee?.calidad ?? 100) / 100));
  destino.velocidadPonderada += orden.velocidadEstandar * minutos;
}

export interface ResumenAgregados {
  dias: number;
  lineas: number;
  causasParada: number;
  causasMerma: number;
}

export async function recalcularAgregados(
  destino: DataSource,
  opciones: OpcionesAgregados,
): Promise<ResumenAgregados> {
  /* Hora local: la aplicación guarda todas sus marcas sin zona. */
  const ahora = ahoraIso();

  const repositorioOrdenes = destino.getRepository(OrdenFabricacion);
  const fechaCorte = new Date(`${opciones.hasta}T00:00:00Z`);
  fechaCorte.setUTCDate(fechaCorte.getUTCDate() - opciones.dias + 1);
  const corte = fechaCorte.toISOString().slice(0, 10);
  const ordenes = await repositorioOrdenes.find({ where: { fecha: MoreThanOrEqual(corte) } });
  const ordenIds = ordenes.map((orden) => orden.id);
  const paradas = ordenIds.length
    ? await destino.getRepository(Parada).find({ where: { ordenId: In(ordenIds) } })
    : [];
  const mermas = ordenIds.length
    ? await destino.getRepository(Merma).find({ where: { ordenId: In(ordenIds) } })
    : [];
  const lineas = await destino.getRepository(Linea).find();
  const productos = await destino.getRepository(Producto).find();
  const causasParada = await destino.getRepository(CausaParada).find();
  const causasMerma = await destino.getRepository(CausaMerma).find();

  const ordenPorId = new Map(ordenes.map((o) => [o.id, o]));
  const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const causaParadaPorId = new Map(causasParada.map((c) => [c.id, c]));
  const causaMermaPorId = new Map(causasMerma.map((c) => [c.id, c]));

  const paradasPorOrden = new Map<string, Parada[]>();
  for (const parada of paradas) {
    const lista = paradasPorOrden.get(parada.ordenId) ?? [];
    lista.push(parada);
    paradasPorOrden.set(parada.ordenId, lista);
  }

  const fechas = [...new Set(ordenes.map((o) => o.fecha))].sort();
  const corteReciente = fechas.length > DIAS_DELTA ? fechas[fechas.length - DIAS_DELTA] : fechas[0];
  const corteAnterior =
    fechas.length > DIAS_DELTA * 2 ? fechas[fechas.length - DIAS_DELTA * 2] : fechas[0];
  const enReciente = (fecha: string) => fecha >= corteReciente;
  const enAnterior = (fecha: string) => fecha >= corteAnterior && fecha < corteReciente;

  /* ---------------------------------------------------------------- */
  /* Acumulados por día, línea, turno y ventana de comparación         */
  /* ---------------------------------------------------------------- */

  const porDia = new Map<string, Acumulado>();
  const porLinea = new Map<string, Acumulado>();
  const porTurno = new Map<TurnoCodigo, Acumulado>();
  const turnoReciente = new Map<TurnoCodigo, Acumulado>();
  const turnoAnterior = new Map<TurnoCodigo, Acumulado>();
  const global = nuevoAcumulado();
  const globalReciente = nuevoAcumulado();
  const globalAnterior = nuevoAcumulado();

  const tomar = <K>(mapa: Map<K, Acumulado>, clave: K): Acumulado => {
    let valor = mapa.get(clave);
    if (!valor) {
      valor = nuevoAcumulado();
      mapa.set(clave, valor);
    }
    return valor;
  };

  for (const orden of ordenes) {
    const minutos = minutosDeOrden(orden, ahora);
    const paradasMin = (paradasPorOrden.get(orden.id) ?? [])
      .filter((p) => p.afectaOee)
      .reduce((total, p) => total + p.duracionMin, 0);

    acumular(tomar(porDia, orden.fecha), minutos, paradasMin, orden);
    acumular(tomar(porLinea, orden.lineaId), minutos, paradasMin, orden);
    acumular(tomar(porTurno, orden.turno), minutos, paradasMin, orden);
    acumular(global, minutos, paradasMin, orden);
    if (enReciente(orden.fecha)) {
      acumular(tomar(turnoReciente, orden.turno), minutos, paradasMin, orden);
      acumular(globalReciente, minutos, paradasMin, orden);
    } else if (enAnterior(orden.fecha)) {
      acumular(tomar(turnoAnterior, orden.turno), minutos, paradasMin, orden);
      acumular(globalAnterior, minutos, paradasMin, orden);
    }
  }

  /* ---------------------------------------------------------------- */
  /* indicador_diario · indicador_linea · indicador_turno              */
  /* ---------------------------------------------------------------- */

  const diarios = fechas.map((fecha) =>
    Object.assign(new IndicadorDiario(), {
      id: `IND-DIA-${fecha}`,
      fecha,
      oee: oeeDe(porDia.get(fecha) ?? nuevoAcumulado()).oee,
      meta: META_OEE,
      prediccionesPredichas: 0,
      prediccionesReales: 0,
    }),
  );

  const indicadoresLinea = lineas
    .filter((l) => porLinea.has(l.id))
    .map((linea, indice) => {
      const a = porLinea.get(linea.id)!;
      return Object.assign(new IndicadorLinea(), {
        id: `IND-LIN-${linea.id}`,
        lineaId: linea.id,
        lineaCodigo: linea.codigo,
        lineaNombre: linea.nombre,
        tiempoPlanificadoMin: Math.round(a.tiempoPlanificadoMin),
        paradasMin: Math.round(a.paradasMin),
        unidadesProducidas: Math.round(a.unidadesProducidas),
        unidadesBuenas: Math.round(a.unidadesBuenas),
        velocidadEstandar: redondear(velocidadMedia(a), 2),
        orden: indice,
      });
    });

  const indicadoresTurno = (['D', 'N'] as TurnoCodigo[])
    .filter((turno) => porTurno.has(turno))
    .map((turno, indice) => {
      const detalle = oeeDe(porTurno.get(turno)!);
      const reciente = turnoReciente.get(turno);
      const anterior = turnoAnterior.get(turno);
      const delta =
        reciente && anterior ? redondear(oeeDe(reciente).oee - oeeDe(anterior).oee) : 0;
      return Object.assign(new IndicadorTurno(), {
        id: `IND-TUR-${turno}`,
        turno,
        turnoLabel: ETIQUETA_TURNO[turno],
        oee: detalle.oee,
        disponibilidad: detalle.disponibilidad,
        desempeno: detalle.desempeno,
        calidad: detalle.calidad,
        deltaOee: delta,
        orden: indice,
      });
    });

  /* ---------------------------------------------------------------- */
  /* parada_agregada · parada_categoria                                */
  /* ---------------------------------------------------------------- */

  const ultimos7 = fechas.slice(-7);
  interface AcumParada {
    causa: CausaParada;
    categoria: CategoriaParada;
    cantidad: number;
    minutos: number;
    porLinea: Map<string, number>;
    porTurno: Record<TurnoCodigo, number>;
    porFecha: Map<string, number>;
  }
  const paradaPorCausa = new Map<string, AcumParada>();

  for (const parada of paradas) {
    const orden = ordenPorId.get(parada.ordenId);
    const causa = causaParadaPorId.get(parada.causaId);
    if (!orden || !causa) continue;
    let acum = paradaPorCausa.get(parada.causaId);
    if (!acum) {
      acum = {
        causa,
        categoria: categoriaDeTipo(causaParadaPorId.get(parada.tipoCausaId)),
        cantidad: 0,
        minutos: 0,
        porLinea: new Map(),
        porTurno: { D: 0, N: 0 },
        porFecha: new Map(),
      };
      paradaPorCausa.set(parada.causaId, acum);
    }
    acum.cantidad += 1;
    acum.minutos += parada.duracionMin;
    acum.porLinea.set(parada.lineaId, (acum.porLinea.get(parada.lineaId) ?? 0) + parada.duracionMin);
    acum.porTurno[orden.turno] += parada.duracionMin;
    acum.porFecha.set(orden.fecha, (acum.porFecha.get(orden.fecha) ?? 0) + parada.duracionMin);
  }

  const codigoLinea = (id: string | undefined) => (id ? (lineaPorId.get(id)?.codigo ?? '—') : '—');
  const lineaTop = (mapa: Map<string, number>) =>
    codigoLinea([...mapa.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]);

  const agregadasParada = [...paradaPorCausa.values()]
    .sort((a, b) => b.minutos - a.minutos)
    .map((a, indice) =>
      Object.assign(new ParadaAgregada(), {
        id: `PAR-AGG-${a.causa.id}`,
        causaId: a.causa.id,
        causaCodigo: a.causa.codigo,
        causaNombre: a.causa.nombre,
        categoria: a.categoria,
        cantidad: a.cantidad,
        minutos: Math.round(a.minutos),
        lineaMasAfectada: lineaTop(a.porLinea),
        tendencia: ultimos7.map((f) => Math.round(a.porFecha.get(f) ?? 0)),
        minutosPorTurno: [Math.round(a.porTurno.D), Math.round(a.porTurno.N)],
        orden: indice,
      }),
    );

  const minutosPorCategoria: Record<CategoriaParada, number> = {
    rutinarias: 0,
    imprevistas: 0,
    fallas: 0,
  };
  for (const a of paradaPorCausa.values()) minutosPorCategoria[a.categoria] += a.minutos;
  const categorias = (Object.keys(minutosPorCategoria) as CategoriaParada[]).map((clave, indice) =>
    Object.assign(new ParadaCategoria(), {
      id: `PAR-CAT-${clave}`,
      clave,
      label: ETIQUETA_CATEGORIA[clave],
      minutos: Math.round(minutosPorCategoria[clave]),
      orden: indice,
    }),
  );

  /* ---------------------------------------------------------------- */
  /* merma_agregada · merma_causa                                      */
  /* ---------------------------------------------------------------- */

  const mermaPorLinea = new Map<string, Record<TipoMermaCodigo, number>>();
  interface AcumMerma {
    causa: CausaMerma;
    kg: number;
    porTipo: Record<TipoMermaCodigo, number>;
    porLinea: Map<string, number>;
    porTurno: Record<TurnoCodigo, number>;
  }
  const mermaPorCausa = new Map<string, AcumMerma>();
  let kgTotales = 0;
  let baldesPasteurizacion = 0;

  for (const merma of mermas) {
    const orden = ordenPorId.get(merma.ordenId);
    const causa = causaMermaPorId.get(merma.causaId);
    if (!orden || !causa) continue;
    kgTotales += merma.cantidadKg;
    if (merma.enviarPasteurizacion) baldesPasteurizacion += 1;

    const porTipoLinea =
      mermaPorLinea.get(merma.lineaId) ?? ({ MP: 0, EP: 0, PT: 0 } as Record<TipoMermaCodigo, number>);
    porTipoLinea[merma.tipo] += merma.cantidadKg;
    mermaPorLinea.set(merma.lineaId, porTipoLinea);

    let acum = mermaPorCausa.get(merma.causaId);
    if (!acum) {
      acum = {
        causa,
        kg: 0,
        porTipo: { MP: 0, EP: 0, PT: 0 },
        porLinea: new Map(),
        porTurno: { D: 0, N: 0 },
      };
      mermaPorCausa.set(merma.causaId, acum);
    }
    acum.kg += merma.cantidadKg;
    acum.porTipo[merma.tipo] += merma.cantidadKg;
    acum.porLinea.set(merma.lineaId, (acum.porLinea.get(merma.lineaId) ?? 0) + merma.cantidadKg);
    acum.porTurno[orden.turno] += merma.cantidadKg;
  }

  const agregadasMerma = lineas
    .filter((l) => mermaPorLinea.has(l.id))
    .map((linea, indice) => {
      const kg = mermaPorLinea.get(linea.id)!;
      return Object.assign(new MermaAgregada(), {
        id: `MER-AGG-${linea.id}`,
        lineaId: linea.id,
        lineaCodigo: linea.codigo,
        lineaNombre: linea.nombre,
        mp: redondear(kg.MP, 2),
        ep: redondear(kg.EP, 2),
        pt: redondear(kg.PT, 2),
        orden: indice,
      });
    });

  const causasMermaAgregadas = [...mermaPorCausa.values()]
    .sort((a, b) => b.kg - a.kg)
    .map((a, indice) => {
      const predominante = (Object.entries(a.porTipo) as [TipoMermaCodigo, number][]).sort(
        (x, y) => y[1] - x[1],
      )[0][0];
      return Object.assign(new MermaCausa(), {
        id: `MER-CAU-${a.causa.id}`,
        causaId: a.causa.id,
        causaCodigo: a.causa.codigo,
        causaNombre: a.causa.nombre,
        tipoPredominante: predominante,
        lineaMasAfectada: lineaTop(a.porLinea),
        kgPorTurno: [redondear(a.porTurno.D, 2), redondear(a.porTurno.N, 2)],
        orden: indice,
      });
    });

  /* ---------------------------------------------------------------- */
  /* indicador_kpi                                                     */
  /* ---------------------------------------------------------------- */

  const kgProducidos = ordenes.reduce((total, orden) => {
    const pesoKg = productoPorId.get(orden.productoId)?.pesoKg ?? 0;
    return total + orden.producido * pesoKg;
  }, 0);

  const oeeGlobal = oeeDe(global);
  const oeeReciente = oeeDe(globalReciente);
  const oeeAnterior = oeeDe(globalAnterior);
  const hayComparacion = globalAnterior.tiempoPlanificadoMin > 0;

  /* Los KPI de la pestaña Paradas cuentan **todas** las paradas registradas, para
   * cuadrar con el Pareto y el donut de clasificación de esa misma pantalla. El
   * filtro por `afectaOee` sólo se aplica a la disponibilidad del OEE, que es
   * donde tiene sentido. */
  const fechaDeParada = (p: Parada) => ordenPorId.get(p.ordenId)?.fecha ?? '';
  const minutosParada = paradas.reduce((t, p) => t + p.duracionMin, 0);
  const paradasRecientes = paradas.filter((p) => enReciente(fechaDeParada(p)));
  const paradasAnteriores = paradas.filter((p) => enAnterior(fechaDeParada(p)));
  const minutosRecientes = paradasRecientes.reduce((t, p) => t + p.duracionMin, 0);
  const minutosAnteriores = paradasAnteriores.reduce((t, p) => t + p.duracionMin, 0);

  const fechaDeMerma = (m: Merma) => ordenPorId.get(m.ordenId)?.fecha ?? '';
  const kgRecientes = mermas
    .filter((m) => enReciente(fechaDeMerma(m)))
    .reduce((t, m) => t + m.cantidadKg, 0);
  const kgAnteriores = mermas
    .filter((m) => enAnterior(fechaDeMerma(m)))
    .reduce((t, m) => t + m.cantidadKg, 0);

  const kpi = (
    ambito: 'indicadores' | 'paradas' | 'mermas',
    clave: string,
    label: string,
    valor: number,
    unidad: string,
    orden: number,
    extra: Partial<IndicadorKpi> = {},
  ): IndicadorKpi =>
    Object.assign(new IndicadorKpi(), {
      id: `KPI-${ambito}-${clave}`,
      ambito,
      clave,
      label,
      valor,
      unidad,
      meta: null,
      deltaValor: null,
      deltaUnidad: null,
      deltaFavorableSiSube: true,
      deltaAnioValor: null,
      orden,
      ...extra,
    });

  const deltaPp = (reciente: number, anterior: number) =>
    hayComparacion ? redondear(reciente - anterior) : null;

  const kpis: IndicadorKpi[] = [
    kpi('indicadores', 'oee', 'OEE', oeeGlobal.oee, '%', 0, {
      meta: META_OEE,
      deltaValor: deltaPp(oeeReciente.oee, oeeAnterior.oee),
      deltaUnidad: 'pp',
    }),
    kpi('indicadores', 'disponibilidad', 'Disponibilidad', oeeGlobal.disponibilidad, '%', 1, {
      deltaValor: deltaPp(oeeReciente.disponibilidad, oeeAnterior.disponibilidad),
      deltaUnidad: 'pp',
    }),
    kpi('indicadores', 'desempeno', 'Desempeño', oeeGlobal.desempeno, '%', 2, {
      deltaValor: deltaPp(oeeReciente.desempeno, oeeAnterior.desempeno),
      deltaUnidad: 'pp',
    }),
    kpi('indicadores', 'calidad', 'Calidad', oeeGlobal.calidad, '%', 3, {
      deltaValor: deltaPp(oeeReciente.calidad, oeeAnterior.calidad),
      deltaUnidad: 'pp',
    }),

    kpi('paradas', 'paradas', 'Paradas', paradas.length, '', 0, {
      deltaValor: hayComparacion ? paradasRecientes.length - paradasAnteriores.length : null,
      deltaUnidad: '',
      deltaFavorableSiSube: false,
    }),
    kpi('paradas', 'minutos', 'Minutos', Math.round(minutosParada), 'min', 1, {
      deltaValor: hayComparacion ? Math.round(minutosRecientes - minutosAnteriores) : null,
      deltaUnidad: 'min',
      deltaFavorableSiSube: false,
    }),
    kpi(
      'paradas',
      'mttr',
      'MTTR',
      paradas.length > 0 ? redondear(minutosParada / paradas.length) : 0,
      'min',
      2,
      { deltaFavorableSiSube: false },
    ),
    kpi(
      'paradas',
      'pct_tiempo',
      '% tiempo',
      global.tiempoPlanificadoMin > 0
        ? redondear((minutosParada / global.tiempoPlanificadoMin) * 100)
        : 0,
      '%',
      3,
      { deltaFavorableSiSube: false },
    ),

    kpi('mermas', 'merma_total', 'Merma total', redondear(kgTotales), 'kg', 0, {
      deltaValor: hayComparacion ? redondear(kgRecientes - kgAnteriores) : null,
      deltaUnidad: 'kg',
      deltaFavorableSiSube: false,
    }),
    kpi(
      'mermas',
      'merma_pct',
      '% sobre producción',
      kgProducidos > 0 ? redondear((kgTotales / kgProducidos) * 100) : 0,
      '%',
      1,
      { deltaFavorableSiSube: false },
    ),
    kpi(
      'mermas',
      'merma_costo',
      'Costo estimado',
      Math.round(kgTotales * opciones.costoMermaSolKg),
      'S/',
      2,
      { deltaFavorableSiSube: false },
    ),
    kpi('mermas', 'baldes', 'Baldes a pasteurizar', baldesPasteurizacion, '', 3, {
      deltaFavorableSiSube: false,
    }),
  ];

  /* ---------------------------------------------------------------- */
  /* Persistencia                                                      */
  /* ---------------------------------------------------------------- */

  await destino.transaction(async (gestor) => {
    for (const [nombre, entidad] of [
      ['indicador_diario', IndicadorDiario],
      ['indicador_linea', IndicadorLinea],
      ['indicador_turno', IndicadorTurno],
      ['indicador_kpi', IndicadorKpi],
      ['parada_agregada', ParadaAgregada],
      ['parada_categoria', ParadaCategoria],
      ['merma_agregada', MermaAgregada],
      ['merma_causa', MermaCausa],
    ] as const) {
      const inicio = Date.now();
      const resultado = await gestor.getRepository(entidad).createQueryBuilder().delete().execute();
      console.log(`  borrado ${nombre}: ${resultado.affected ?? 0} · ${Date.now() - inicio} ms`);
    }
    for (const [nombre, entidad, filas] of [
      ['indicador_diario', IndicadorDiario, diarios],
      ['indicador_linea', IndicadorLinea, indicadoresLinea],
      ['indicador_turno', IndicadorTurno, indicadoresTurno],
      ['indicador_kpi', IndicadorKpi, kpis],
      ['parada_agregada', ParadaAgregada, agregadasParada],
      ['parada_categoria', ParadaCategoria, categorias],
      ['merma_agregada', MermaAgregada, agregadasMerma],
      ['merma_causa', MermaCausa, causasMermaAgregadas],
    ] as const) {
      const inicio = Date.now();
      if (filas.length) {
        await gestor.getRepository(entidad as never).insert(filas as never);
      }
      console.log(`  inserción ${nombre}: ${filas.length} · ${Date.now() - inicio} ms`);
    }
  });

  return {
    dias: diarios.length,
    lineas: indicadoresLinea.length,
    causasParada: agregadasParada.length,
    causasMerma: causasMermaAgregadas.length,
  };
}
