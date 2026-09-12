import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { addDays, toIsoDate } from '@mes/shared';
import type { HeatmapCelda, InsightCard, Recurrencia, Turno } from '@mes/types';
import { TURNO_LABEL, TURNOS } from '@mes/types';
import {
  CausaParada,
  Linea,
  Merma,
  OrdenFabricacion,
  Parada,
  Producto,
} from '../../../database/entities';
import { generarReglas, OPCIONES_APRIORI, type Cesta, type ReglaAsociativa } from './apriori';

/* ------------------------------------------------------------------ */
/* Vocabulario de ítems (plan §5.5)                                    */
/* ------------------------------------------------------------------ */

const ITEM_LINEA = 'linea=';
const ITEM_TURNO = 'turno=';
const ITEM_FAMILIA = 'familia=';
const ITEM_TIPO_CAUSA = 'tipoCausa=';
const ITEM_CAUSA = 'causa=';
const ITEM_DIA_SEMANA = 'diaSemana=';
const ITEM_FRANJA = 'franja=';
const ITEM_TRAS_CAMBIO = 'trasCambioProducto';
const ITEM_TRAS_ARRANQUE = 'trasArranque';
const ITEM_MERMA_ALTA = 'mermaAlta';

/**
 * Ítems que describen una parada concreta y no el turno entero. Sólo estos
 * filtran los minutos al calcular `impactoMin`: si la regla habla de
 * `causa=PN-04-16`, los minutos que se le imputan son los de esa causa, no los
 * de todas las paradas del turno.
 */
const PREFIJOS_DE_PARADA = [ITEM_TIPO_CAUSA, ITEM_CAUSA, ITEM_FRANJA] as const;

/** Ventana de análisis de los patrones, en días (plan §5.5: «últimos 30 días»). */
const DIAS_VENTANA = 30;

/** Franjas de 6 h sobre la hora de inicio de la parada. */
const FRANJAS = ['00-06h', '06-12h', '12-18h', '18-24h'] as const;

/**
 * Turno al que pertenece cada franja (D 06–18 / N 18–06). Sirve para descartar
 * reglas que sólo repiten la definición del turno («en turno Día y en la franja
 * 06:00–12:00»), que no son un hallazgo sino una tautología del calendario.
 */
const TURNO_DE_FRANJA: Record<string, Turno> = {
  '00-06h': 'N',
  '06-12h': 'D',
  '12-18h': 'D',
  '18-24h': 'N',
};

/** `Date.getDay()` → abreviatura usada en el ítem `diaSemana=`. */
const DIAS_ABREVIADOS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const;

const DIAS_NOMBRE: Record<string, string> = {
  lun: 'lunes',
  mar: 'martes',
  mie: 'miércoles',
  jue: 'jueves',
  vie: 'viernes',
  sab: 'sábados',
  dom: 'domingos',
};

/** Percentil que separa un turno de «merma alta» del resto. */
const PERCENTIL_MERMA_ALTA = 75;

/** Nº máximo de recurrencias devueltas a la tabla de la pestaña Patrones. */
const MAX_RECURRENCIAS = 10;

/** Nº de hallazgos del modelo que pinta la pestaña Resumen. */
const MAX_INSIGHTS = 3;

/* ------------------------------------------------------------------ */
/* Estructuras internas                                                */
/* ------------------------------------------------------------------ */

/** Parada reducida a lo que necesita el motor de patrones. */
interface ParadaCesta {
  tipoCausa: string;
  causa: string;
  franja: string;
  duracionMin: number;
}

/** Cesta = unidad de análisis `línea × fecha × turno` (plan §4.1). */
interface CestaTurno extends Cesta {
  lineaId: string;
  lineaCodigo: string;
  lineaNombre: string;
  fecha: string;
  turno: Turno;
  paradas: ParadaCesta[];
  mermaKg: number;
}

/** Todo lo que el análisis necesita, cargado de una sola pasada. */
interface ContextoPatrones {
  cestas: CestaTurno[];
  /** Paradas de la ventana, para los denominadores «N de M» de los insights. */
  paradas: ParadaCesta[];
  /** Etiqueta legible por código de causa (`PN-04-16` → `Falla Operativa`). */
  nombreCausa: Map<string, string>;
  /** Código de causa → él mismo y todos sus ascendientes del árbol de 3 niveles. */
  ancestros: Map<string, Set<string>>;
  /** Código de línea → nombre de planta (`MOLD-A4` → `Moldeadora A4`). */
  nombreLinea: Map<string, string>;
  desde: string;
  hasta: string;
  dias: number;
  eventos: number;
}

/** Regla enriquecida con los minutos reales que le corresponden. */
interface ReglaConImpacto {
  regla: ReglaAsociativa;
  /** Minutos de parada imputables a la regla. */
  impactoMin: number;
  /** Nº de paradas que sostienen esos minutos. */
  eventos: number;
  /** Códigos de línea implicados, ordenados por minutos aportados. */
  lineas: string[];
  patron: string;
}

/* ------------------------------------------------------------------ */
/* Servicio                                                            */
/* ------------------------------------------------------------------ */

/**
 * Motor de detección de patrones de la pestaña «Patrones» y de los «Hallazgos
 * del modelo» (CU-3 y CU-4 del plan de analítica).
 *
 * No es un clasificador: el heatmap es una agregación exacta sobre `parada` y
 * las recurrencias salen de reglas asociativas (Apriori) calculadas sobre
 * cestas `línea × fecha × turno`. Toda cifra publicada es reproducible con una
 * consulta SQL sobre `parada`, `merma` y `orden_fabricacion`.
 */
@Injectable()
export class PatronesService {
  constructor(
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(CausaParada) private readonly causas: Repository<CausaParada>,
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
  ) {}

  /* ---------------------------------------------------------------- */
  /* CU-3 · Heatmap causa raíz × turno                                 */
  /* ---------------------------------------------------------------- */

  /**
   * `SUM(parada.duracionMin)` por causa raíz (`parada.tipoCausaId`) × turno.
   *
   * El turno **no** se deriva de `parada.inicio`: se toma de la orden
   * (`orden_fabricacion.turno`) porque el turno Noche cruza la medianoche y una
   * parada iniciada a las 05:50 pertenece al turno N del día anterior.
   *
   * Cubre todo el histórico de `parada` (sin ventana), de modo que la suma de
   * las celdas es exactamente `SELECT SUM("duracionMin") FROM parada`.
   */
  async heatmap(): Promise<HeatmapCelda[]> {
    const [paradas, ordenes, causas] = await Promise.all([
      this.paradas.find(),
      this.ordenes.find(),
      this.causas.find(),
    ]);
    const turnoPorOrden = new Map(ordenes.map((o) => [o.id, o.turno]));
    const causaPorId = new Map(causas.map((c) => [c.id, c]));

    /* `filaId` = id del tipo de causa; el valor acumula minutos por turno. */
    const minutos = new Map<string, Record<Turno, number>>();
    for (const parada of paradas) {
      const turno = turnoPorOrden.get(parada.ordenId);
      if (!turno) continue;
      const fila = minutos.get(parada.tipoCausaId) ?? { D: 0, N: 0 };
      fila[turno] += parada.duracionMin;
      minutos.set(parada.tipoCausaId, fila);
    }

    const filas = [...minutos.entries()]
      .map(([tipoCausaId, porTurno]) => {
        const causa = causaPorId.get(tipoCausaId);
        const codigo = causa?.codigo ?? tipoCausaId;
        return {
          codigo,
          label: causa ? `${causa.codigo} ${causa.nombre}` : tipoCausaId,
          porTurno,
          total: TURNOS.reduce((suma, turno) => suma + porTurno[turno], 0),
        };
      })
      /* Las causas que más minutos cuestan arriba: es un mapa de calor, no un
       * catálogo, y la lectura natural es de mayor a menor impacto. */
      .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo));

    return filas.flatMap((fila) =>
      TURNOS.map((turno) => ({
        fila: fila.codigo,
        filaLabel: fila.label,
        columna: turno,
        columnaLabel: TURNO_LABEL[turno],
        valor: fila.porTurno[turno],
      })),
    );
  }

  /* ---------------------------------------------------------------- */
  /* CU-4 · Reglas asociativas                                         */
  /* ---------------------------------------------------------------- */

  /** Reglas asociativas (Apriori) sobre paradas y mermas de la ventana. */
  async recurrencias(): Promise<Recurrencia[]> {
    const contexto = await this.construirContexto();
    const reglas = this.reglasConImpacto(contexto);
    return reglas.slice(0, MAX_RECURRENCIAS).map((entrada, indice) => ({
      id: `REC-${String(indice + 1).padStart(2, '0')}`,
      patron: entrada.patron,
      frecuencia: entrada.regla.soporte,
      impactoMin: entrada.impactoMin,
      lineas: entrada.lineas,
      confianza: Math.round(entrada.regla.confianza * 100),
    }));
  }

  /**
   * Top-3 hallazgos en lenguaje natural: las reglas con mayor `impactoMin ×
   * lift`. El tono es `warning` cuando el impacto supera la mediana e `info`
   * cuando no, tal y como fija el plan §5.5.
   *
   * La mediana se toma sobre las recurrencias **publicadas** (las mismas que
   * ve el usuario en la pestaña Patrones) y no sobre las ~670 reglas que
   * superan los umbrales: la cola larga incluye reglas de merma sin minutos de
   * parada, cuya mediana sería 0 y pintaría todo de `warning`.
   */
  async insights(): Promise<InsightCard[]> {
    const contexto = await this.construirContexto();
    const reglas = this.reglasConImpacto(contexto);
    if (reglas.length === 0) return [];

    const mediana = medianaDe(reglas.slice(0, MAX_RECURRENCIAS).map((r) => r.impactoMin));
    const ordenadas = [...reglas].sort(
      (a, b) => b.impactoMin * b.regla.lift - a.impactoMin * a.regla.lift,
    );
    /* Un hallazgo por evento: tres tarjetas sobre la misma causa dirían lo
     * mismo tres veces y desaprovecharían el espacio del Resumen. */
    const vistos = new Set<string>();
    const elegidas: ReglaConImpacto[] = [];
    for (const entrada of ordenadas) {
      if (elegidas.length >= MAX_INSIGHTS) break;
      if (vistos.has(entrada.regla.consecuente)) continue;
      vistos.add(entrada.regla.consecuente);
      elegidas.push(entrada);
    }

    return elegidas.map((entrada, indice) => ({
      id: `INS-${String(indice + 1).padStart(2, '0')}`,
      tono: entrada.impactoMin > mediana ? ('warning' as const) : ('info' as const),
      texto: entrada.patron,
      soporte: this.fraseSoporte(entrada, contexto),
      confianza: Math.round(entrada.regla.confianza * 100),
    }));
  }

  /** Nº de eventos (paradas + mermas) sobre los que se calcularon los patrones. */
  async eventosAnalizados(): Promise<number> {
    const contexto = await this.construirContexto();
    return contexto.eventos;
  }

  /* ---------------------------------------------------------------- */
  /* Construcción de cestas                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Carga órdenes, paradas y mermas y arma una cesta por `línea × fecha ×
   * turno`. La ventana se ancla en la **última fecha con producción**, no en
   * `new Date()`: así el análisis sigue siendo reproducible cuando la base se
   * consulta días después de la última sincronización.
   */
  private async construirContexto(): Promise<ContextoPatrones> {
    const [ordenes, paradas, mermas, causas, lineas, productos] = await Promise.all([
      this.ordenes.find(),
      this.paradas.find(),
      this.mermas.find(),
      this.causas.find(),
      this.lineas.find(),
      this.productos.find(),
    ]);

    const nombreCausa = new Map(causas.map((c) => [c.codigo, c.nombre]));
    const codigoCausa = new Map(causas.map((c) => [c.id, c.codigo]));
    const ancestros = ascendenciaDeCausas(causas);
    const nombreLinea = new Map(lineas.map((l) => [l.codigo, l.nombre]));
    const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
    const familiaPorProducto = new Map(productos.map((p) => [p.id, familiaDe(p)]));

    const fechas = ordenes.map((o) => o.fecha).sort();
    const vacio: ContextoPatrones = {
      cestas: [],
      paradas: [],
      nombreCausa,
      ancestros,
      nombreLinea,
      desde: '',
      hasta: '',
      dias: DIAS_VENTANA,
      eventos: 0,
    };
    if (fechas.length === 0) return vacio;

    const hasta = fechas[fechas.length - 1];
    const desde = toIsoDate(addDays(hasta, -(DIAS_VENTANA - 1)));
    const primeraFecha = fechas[0];

    const ordenesVentana = ordenes.filter((o) => o.fecha >= desde && o.fecha <= hasta);
    if (ordenesVentana.length === 0) return vacio;

    /* Turnos con producción: sirven para saber si un turno viene de un arranque
     * (la línea no produjo en el turno anterior). Se usa el histórico completo,
     * no sólo la ventana, para no marcar como arranque el borde izquierdo. */
    const turnosConProduccion = new Set(
      ordenes.map((o) => claveTurno(o.lineaId, o.fecha, o.turno)),
    );

    const porCesta = new Map<string, CestaTurno>();
    const familias = new Map<string, Set<string>>();
    const productosPorCesta = new Map<string, Set<string>>();
    const ordenACesta = new Map<string, string>();

    for (const orden of ordenesVentana) {
      const id = claveTurno(orden.lineaId, orden.fecha, orden.turno);
      ordenACesta.set(orden.id, id);
      if (!porCesta.has(id)) {
        const linea = lineaPorId.get(orden.lineaId);
        porCesta.set(id, {
          id,
          items: [],
          lineaId: orden.lineaId,
          lineaCodigo: linea?.codigo ?? orden.lineaId,
          lineaNombre: linea?.nombre ?? linea?.codigo ?? orden.lineaId,
          fecha: orden.fecha,
          turno: orden.turno,
          paradas: [],
          mermaKg: 0,
        });
        familias.set(id, new Set());
        productosPorCesta.set(id, new Set());
      }
      familias.get(id)?.add(familiaPorProducto.get(orden.productoId) ?? 'Sin clasificar');
      productosPorCesta.get(id)?.add(orden.productoId);
    }

    const paradasVentana: ParadaCesta[] = [];
    for (const parada of paradas) {
      const idCesta = ordenACesta.get(parada.ordenId);
      if (!idCesta) continue;
      const entrada: ParadaCesta = {
        tipoCausa: codigoCausa.get(parada.tipoCausaId) ?? parada.tipoCausaId,
        causa: codigoCausa.get(parada.causaId) ?? parada.causaId,
        franja: franjaDe(parada.inicio),
        duracionMin: parada.duracionMin,
      };
      porCesta.get(idCesta)?.paradas.push(entrada);
      paradasVentana.push(entrada);
    }

    let mermasVentana = 0;
    for (const merma of mermas) {
      const idCesta = ordenACesta.get(merma.ordenId);
      if (!idCesta) continue;
      const cesta = porCesta.get(idCesta);
      if (!cesta) continue;
      cesta.mermaKg += merma.cantidadKg;
      mermasVentana += 1;
    }

    const cestas = [...porCesta.values()].sort((a, b) => a.id.localeCompare(b.id));
    const umbralMerma = percentil(
      cestas.map((c) => c.mermaKg),
      PERCENTIL_MERMA_ALTA,
    );

    for (const cesta of cestas) {
      cesta.items = this.itemsDe(cesta, {
        familias: familias.get(cesta.id) ?? new Set(),
        productos: productosPorCesta.get(cesta.id)?.size ?? 0,
        umbralMerma,
        turnosConProduccion,
        primeraFecha,
      });
    }

    return {
      cestas,
      paradas: paradasVentana,
      nombreCausa,
      ancestros,
      nombreLinea,
      desde,
      hasta,
      dias: DIAS_VENTANA,
      eventos: paradasVentana.length + mermasVentana,
    };
  }

  /** Ítems de una cesta según el vocabulario del plan §5.5. */
  private itemsDe(
    cesta: CestaTurno,
    ctx: {
      familias: Set<string>;
      productos: number;
      umbralMerma: number;
      turnosConProduccion: Set<string>;
      primeraFecha: string;
    },
  ): string[] {
    const items = new Set<string>([
      `${ITEM_LINEA}${cesta.lineaCodigo}`,
      `${ITEM_TURNO}${cesta.turno}`,
      `${ITEM_DIA_SEMANA}${diaSemanaDe(cesta.fecha)}`,
    ]);
    for (const familia of ctx.familias) items.add(`${ITEM_FAMILIA}${familia}`);
    for (const parada of cesta.paradas) {
      items.add(`${ITEM_TIPO_CAUSA}${parada.tipoCausa}`);
      items.add(`${ITEM_CAUSA}${parada.causa}`);
      items.add(`${ITEM_FRANJA}${parada.franja}`);
    }
    /* Más de un producto en el mismo turno ⇒ hubo al menos un cambio. */
    if (ctx.productos > 1) items.add(ITEM_TRAS_CAMBIO);
    if (cesta.mermaKg > ctx.umbralMerma && ctx.umbralMerma > 0) items.add(ITEM_MERMA_ALTA);

    const anterior = turnoAnterior(cesta.lineaId, cesta.fecha, cesta.turno);
    /* En el borde izquierdo del histórico no se sabe si hubo arranque: no se
     * marca nada antes que inventar un ítem sistemático para el primer día. */
    if (anterior.fecha >= ctx.primeraFecha && !ctx.turnosConProduccion.has(anterior.clave)) {
      items.add(ITEM_TRAS_ARRANQUE);
    }
    return [...items];
  }

  /* ---------------------------------------------------------------- */
  /* Reglas + impacto                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Aplica Apriori, imputa minutos a cada regla y elimina redundancias.
   *
   * `impactoMin` = minutos de las paradas que (a) están en una cesta que
   * sostiene la regla y (b) cumplen los ítems de parada de la regla
   * (`tipoCausa`, `causa`, `franja`). Es exactamente lo que se puede
   * reproducir con un `SUM("duracionMin")` filtrado por esos mismos campos.
   */
  private reglasConImpacto(contexto: ContextoPatrones): ReglaConImpacto[] {
    if (contexto.cestas.length === 0) return [];
    const reglas = generarReglas(contexto.cestas, OPCIONES_APRIORI).filter((regla) =>
      esReglaPublicable(regla, contexto.ancestros),
    );
    const porId = new Map(contexto.cestas.map((c) => [c.id, c]));

    const enriquecidas = reglas.map<ReglaConImpacto>((regla) => {
      const filtros = [...regla.antecedente, regla.consecuente].filter((item) =>
        PREFIJOS_DE_PARADA.some((prefijo) => item.startsWith(prefijo)),
      );
      let impactoMin = 0;
      let eventos = 0;
      const minutosPorLinea = new Map<string, number>();
      for (const idCesta of regla.cestas) {
        const cesta = porId.get(idCesta);
        if (!cesta) continue;
        for (const parada of cesta.paradas) {
          if (!filtros.every((item) => paradaCumple(parada, item))) continue;
          impactoMin += parada.duracionMin;
          eventos += 1;
          minutosPorLinea.set(
            cesta.lineaCodigo,
            (minutosPorLinea.get(cesta.lineaCodigo) ?? 0) + parada.duracionMin,
          );
        }
      }
      /* Una regla que sólo habla de merma no cuesta minutos de parada: darle los
       * del turno entero mezclaría dos magnitudes y falsearía el ranking. */
      if (filtros.length === 0 && regla.consecuente === ITEM_MERMA_ALTA) {
        impactoMin = 0;
        eventos = 0;
      }

      const lineas =
        minutosPorLinea.size > 0
          ? [...minutosPorLinea.entries()]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .map(([codigo]) => codigo)
          : [
              ...new Set(regla.cestas.map((id) => porId.get(id)?.lineaCodigo).filter(esTexto)),
            ].sort();

      return {
        regla,
        impactoMin,
        eventos,
        lineas,
        patron: this.frasePatron(regla, contexto),
      };
    });

    return depurarRedundantes(enriquecidas);
  }

  /* ---------------------------------------------------------------- */
  /* Lenguaje natural                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Convierte la regla en una frase en castellano. El antecedente aporta el
   * contexto («En la Llenadora M2 y turno Noche…») y el consecuente el
   * predicado («…se repiten paradas por PN-02-02 (Falla operacional)»).
   */
  private frasePatron(regla: ReglaAsociativa, contexto: ContextoPatrones): string {
    const tiempo: string[] = [];
    const nominales: string[] = [];
    const condiciones: string[] = [];
    for (const item of regla.antecedente) {
      const fragmento = fragmentoContexto(item, contexto);
      if (!fragmento) continue;
      if (fragmento.posicion === 'tiempo') tiempo.push(fragmento.texto);
      else if (fragmento.posicion === 'lugar') nominales.push(fragmento.texto);
      else condiciones.push(fragmento.texto);
    }

    const predicado = predicadoDe(regla.consecuente, contexto);
    const partes = [...tiempo];
    if (nominales.length > 0) partes.push(`en ${unirY(nominales)}`);
    partes.push(...condiciones);
    if (partes.length === 0) return capitalizar(predicado);
    return `${capitalizar(partes.join(', '))}, ${predicado}`;
  }

  /**
   * Frase de apoyo del insight con las cifras que cualquiera puede comprobar en
   * la base: «48 de 142 paradas por PN-02-01 (Falla mantto) · 390 min en los
   * últimos 30 días».
   */
  private fraseSoporte(entrada: ReglaConImpacto, contexto: ContextoPatrones): string {
    const items = [...entrada.regla.antecedente, entrada.regla.consecuente];
    const causa = items.find((i) => i.startsWith(ITEM_CAUSA));
    const tipo = items.find((i) => i.startsWith(ITEM_TIPO_CAUSA));
    const minutos = `${entrada.impactoMin} min perdidos en los últimos ${contexto.dias} días`;

    if (causa || tipo) {
      const codigo = (causa ?? tipo ?? '').split('=')[1];
      const esEspecifica = Boolean(causa);
      const total = contexto.paradas.filter((p) =>
        esEspecifica ? p.causa === codigo : p.tipoCausa === codigo,
      ).length;
      return `${entrada.eventos} de ${total} paradas por ${etiquetaCausa(codigo, contexto.nombreCausa)} · ${minutos}`;
    }

    const turnos = entrada.regla.soporte;
    return `${turnos} de ${contexto.cestas.length} turnos analizados · ${minutos}`;
  }
}

/* ------------------------------------------------------------------ */
/* Ayudantes puros                                                     */
/* ------------------------------------------------------------------ */

function esTexto(valor: string | undefined): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

function claveTurno(lineaId: string, fecha: string, turno: Turno): string {
  return `${lineaId}|${fecha}|${turno}`;
}

/** Turno inmediatamente anterior de la misma línea (`D` ← `N` del día previo). */
function turnoAnterior(
  lineaId: string,
  fecha: string,
  turno: Turno,
): { clave: string; fecha: string } {
  const fechaAnterior = turno === 'D' ? toIsoDate(addDays(fecha, -1)) : fecha;
  const turnoPrevio: Turno = turno === 'D' ? 'N' : 'D';
  return { clave: claveTurno(lineaId, fechaAnterior, turnoPrevio), fecha: fechaAnterior };
}

/** Franja de 6 h a partir de la hora de inicio `YYYY-MM-DDTHH:mm:ss`. */
function franjaDe(inicio: string): string {
  const hora = Number(inicio.slice(11, 13));
  if (!Number.isFinite(hora)) return FRANJAS[0];
  return FRANJAS[Math.min(FRANJAS.length - 1, Math.floor(hora / 6))];
}

function diaSemanaDe(fecha: string): string {
  return DIAS_ABREVIADOS[new Date(`${fecha}T00:00:00`).getDay()];
}

/**
 * Familia de producto: el sabor del maestro agrupa los 201 productos en ~25
 * clases con soporte suficiente (el plan §4.2 prohíbe expresamente el one-hot
 * de 201 productos). Cuando el maestro no resolvió el sabor se cae a la primera
 * palabra del nombre comercial (`POTE`, `CUB`, `CONO`).
 */
function familiaDe(producto: Producto): string {
  const sabor = producto.sabor?.trim();
  if (sabor) return sabor;
  const palabra = producto.nombre.trim().split(/[\s-]+/)[0];
  return palabra ? capitalizar(palabra.toLowerCase()) : 'Sin clasificar';
}

/** Percentil por rango más próximo sobre una muestra sin ordenar. */
function percentil(valores: number[], percentilPedido: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const rango = Math.ceil((percentilPedido / 100) * ordenados.length);
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, rango - 1))];
}

function medianaDe(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[medio - 1] + ordenados[medio]) / 2
    : ordenados[medio];
}

/** ¿La parada satisface un ítem de nivel parada (`causa=`, `tipoCausa=`, `franja=`)? */
function paradaCumple(parada: ParadaCesta, item: string): boolean {
  if (item.startsWith(ITEM_CAUSA)) return parada.causa === item.slice(ITEM_CAUSA.length);
  if (item.startsWith(ITEM_TIPO_CAUSA))
    return parada.tipoCausa === item.slice(ITEM_TIPO_CAUSA.length);
  if (item.startsWith(ITEM_FRANJA)) return parada.franja === item.slice(ITEM_FRANJA.length);
  return true;
}

/**
 * Apriori genera reglas anidadas (`{línea} → causa` y `{línea, turno} → causa`).
 * Se conserva la más general de cada familia porque es la de mayor impacto, y
 * se descartan sus refinamientos: la tabla de la UI no gana nada repitiendo el
 * mismo hallazgo con un matiz más.
 */
function depurarRedundantes(reglas: ReglaConImpacto[]): ReglaConImpacto[] {
  const porItemset = new Map<string, ReglaConImpacto>();
  for (const entrada of reglas) {
    const clave = entrada.regla.items.join('|');
    const actual = porItemset.get(clave);
    /* Un mismo itemset produce varias reglas según qué ítem sea el consecuente;
     * se publica la de mayor lift, que es la dirección más informativa. */
    if (!actual || entrada.regla.lift > actual.regla.lift) porItemset.set(clave, entrada);
  }

  const candidatas = [...porItemset.values()].sort(
    (a, b) =>
      b.impactoMin - a.impactoMin ||
      b.regla.soporte - a.regla.soporte ||
      b.regla.lift - a.regla.lift,
  );

  const conservadas: ReglaConImpacto[] = [];
  for (const entrada of candidatas) {
    const items = new Set(entrada.regla.items);
    const redundante = conservadas.some(
      (previa) =>
        previa.regla.consecuente === entrada.regla.consecuente &&
        previa.regla.items.every((item) => items.has(item)),
    );
    if (!redundante) conservadas.push(entrada);
  }
  return conservadas;
}

/**
 * Ascendencia del árbol de causas de parada (tipo → general → específica):
 * cada código apunta a sí mismo y a todos sus padres. Se usa para detectar
 * reglas tautológicas del tipo «si hay PS-05-06 hay paradas de tipo PS-05».
 */
function ascendenciaDeCausas(causas: CausaParada[]): Map<string, Set<string>> {
  const porId = new Map(causas.map((c) => [c.id, c]));
  const salida = new Map<string, Set<string>>();
  for (const causa of causas) {
    const cadena = new Set<string>();
    let actual: CausaParada | undefined = causa;
    /* El árbol tiene 3 niveles; el contador corta cualquier ciclo accidental. */
    let saltos = 0;
    while (actual && saltos < 8) {
      cadena.add(actual.codigo);
      actual = actual.parentId ? porId.get(actual.parentId) : undefined;
      saltos += 1;
    }
    salida.set(causa.codigo, cadena);
  }
  return salida;
}

/** Código de la causa si el ítem pertenece a la dimensión causa; `null` si no. */
function codigoDeCausa(item: string): string | null {
  if (item.startsWith(ITEM_CAUSA)) return item.slice(ITEM_CAUSA.length);
  if (item.startsWith(ITEM_TIPO_CAUSA)) return item.slice(ITEM_TIPO_CAUSA.length);
  return null;
}

/**
 * Filtra las reglas que no son un hallazgo de planta:
 *
 * 1. El consecuente debe ser el **evento** (una causa de parada o `mermaAlta`).
 *    Las reglas con consecuente de contexto (`turno=D`, `linea=…`) sólo dicen
 *    dónde ocurre lo que ya se sabía y además no tienen `impactoMin` propio.
 * 2. Se descartan las tautologías del árbol de causas: `causa=PS-05-06` implica
 *    por definición `tipoCausa=PS-05`, con confianza 100 % y lift alto.
 * 3. Se descartan las tautologías del calendario: la franja `06-12h` sólo
 *    existe dentro del turno Día, así que la pareja no aporta información.
 */
function esReglaPublicable(regla: ReglaAsociativa, ancestros: Map<string, Set<string>>): boolean {
  const codigoConsecuente = codigoDeCausa(regla.consecuente);
  if (!codigoConsecuente && regla.consecuente !== ITEM_MERMA_ALTA) return false;

  if (codigoConsecuente) {
    for (const item of regla.antecedente) {
      const codigo = codigoDeCausa(item);
      if (!codigo) continue;
      const emparentados =
        ancestros.get(codigoConsecuente)?.has(codigo) ||
        ancestros.get(codigo)?.has(codigoConsecuente);
      if (emparentados) return false;
    }
  }

  const turno = regla.items.find((i) => i.startsWith(ITEM_TURNO))?.slice(ITEM_TURNO.length);
  const franja = regla.items.find((i) => i.startsWith(ITEM_FRANJA))?.slice(ITEM_FRANJA.length);
  if (turno && franja && TURNO_DE_FRANJA[franja] === turno) return false;

  return true;
}

/**
 * `PN-04-16` → `PN-04-16 Falla Operativa`; nunca un código desnudo. Se usa el
 * mismo formato `codigo nombre` que el `filaLabel` del heatmap, que además
 * evita los paréntesis anidados de causas como `Paro rutinario (planificado)`.
 */
function etiquetaCausa(codigo: string, nombreCausa: Map<string, string>): string {
  const nombre = nombreCausa.get(codigo);
  return nombre ? `${codigo} ${nombre}` : codigo;
}

interface Fragmento {
  texto: string;
  /**
   * Dónde encaja el fragmento en la frase: `tiempo` abre («Los lunes, …»),
   * `lugar` va detrás de «en …» y `condicion` cierra el contexto.
   */
  posicion: 'tiempo' | 'lugar' | 'condicion';
}

/** Fragmento de contexto para un ítem del antecedente. */
function fragmentoContexto(item: string, contexto: ContextoPatrones): Fragmento | null {
  if (item.startsWith(ITEM_LINEA)) {
    return { texto: etiquetaLinea(item.slice(ITEM_LINEA.length), contexto), posicion: 'lugar' };
  }
  if (item.startsWith(ITEM_TURNO)) {
    return { texto: etiquetaTurno(item.slice(ITEM_TURNO.length)), posicion: 'lugar' };
  }
  if (item.startsWith(ITEM_FAMILIA)) {
    return { texto: `productos de ${item.slice(ITEM_FAMILIA.length)}`, posicion: 'lugar' };
  }
  if (item.startsWith(ITEM_FRANJA)) {
    return {
      texto: `la franja ${horarioDe(item.slice(ITEM_FRANJA.length))}`,
      posicion: 'lugar',
    };
  }
  if (item.startsWith(ITEM_DIA_SEMANA)) {
    const dia = item.slice(ITEM_DIA_SEMANA.length);
    return { texto: `los ${DIAS_NOMBRE[dia] ?? dia}`, posicion: 'tiempo' };
  }
  if (item.startsWith(ITEM_CAUSA)) {
    const codigo = item.slice(ITEM_CAUSA.length);
    return {
      texto: `con paradas por ${etiquetaCausa(codigo, contexto.nombreCausa)}`,
      posicion: 'condicion',
    };
  }
  if (item.startsWith(ITEM_TIPO_CAUSA)) {
    const codigo = item.slice(ITEM_TIPO_CAUSA.length);
    return {
      texto: `con paradas de tipo ${etiquetaCausa(codigo, contexto.nombreCausa)}`,
      posicion: 'condicion',
    };
  }
  if (item === ITEM_TRAS_CAMBIO)
    return { texto: 'tras un cambio de producto', posicion: 'condicion' };
  if (item === ITEM_TRAS_ARRANQUE)
    return { texto: 'tras un arranque de línea', posicion: 'condicion' };
  if (item === ITEM_MERMA_ALTA) return { texto: 'con merma alta', posicion: 'condicion' };
  return null;
}

/**
 * Predicado de la frase a partir del ítem consecuente. Sólo hay tres formas
 * posibles porque `esReglaPublicable` limita el consecuente al evento.
 */
function predicadoDe(item: string, contexto: ContextoPatrones): string {
  if (item.startsWith(ITEM_CAUSA)) {
    const codigo = item.slice(ITEM_CAUSA.length);
    return `se repiten paradas por ${etiquetaCausa(codigo, contexto.nombreCausa)}`;
  }
  if (item.startsWith(ITEM_TIPO_CAUSA)) {
    const codigo = item.slice(ITEM_TIPO_CAUSA.length);
    return `se repiten paradas de tipo ${etiquetaCausa(codigo, contexto.nombreCausa)}`;
  }
  if (item === ITEM_MERMA_ALTA) return 'la merma del turno se dispara por encima del umbral alto';
  return item;
}

/** `MOLD-A4` → `la línea Moldeadora A4`; nunca el código a secas. */
function etiquetaLinea(codigo: string, contexto: ContextoPatrones): string {
  const nombre = contexto.nombreLinea.get(codigo);
  return nombre ? `la línea ${nombre} (${codigo})` : `la línea ${codigo}`;
}

function etiquetaTurno(codigo: string): string {
  return `turno ${TURNO_LABEL[codigo as Turno] ?? codigo}`;
}

/** `12-18h` → `entre las 12:00 y las 18:00`. */
function horarioDe(franja: string): string {
  const [desde, hasta] = franja.replace('h', '').split('-');
  return `entre las ${desde}:00 y las ${hasta}:00`;
}

/** `['a', 'b', 'c']` → `a, b y c`. */
function unirY(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

function capitalizar(texto: string): string {
  return texto.length === 0 ? texto : texto[0].toUpperCase() + texto.slice(1);
}
