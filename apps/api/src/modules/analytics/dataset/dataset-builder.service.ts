import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { calcDesvioVelocidad } from '@mes/shared';
import type { Turno } from '@mes/types';
import {
  CausaParada,
  Linea,
  Merma,
  ModoMuestra,
  MuestraAnalitica,
  OrdenFabricacion,
  Parada,
  type PerfilDatos,
  Producto,
  VelocidadEstandar,
} from '../../../database/entities';
import { ahoraIso } from '../../../common/utils';
import {
  type DefinicionFeature,
  construirCatalogo,
  familiaDeSabor,
  nombreFeatureFamilia,
  nombreFeatureLinea,
  nombresRetrospectivos,
} from './features';

/** Minutos mínimos de una parada para que cuente como evento relevante (§4.1). */
export const UMBRAL_MIN_PARADA = 10;

/**
 * Prefijo de los tipos de causa que cuentan como parada imprevista real.
 *
 * `causa_parada.clasificacion` marca como `imprevista` toda la rama
 * `PS-05 Paro sin programa`, de la que cuelgan `Refrigerio` —la causa nº 1 del
 * corpus, 113 eventos y 6 011 min— y `Apoyo a otra línea`: tiempo sin programa
 * de producción, no averías. Contarlas dejaba el target en el 63 % de los
 * granos, con lo que el modelo aprendía el horario del almuerzo en vez de las
 * fallas. El target son las ramas `PN-*` (fallas, demoras e imprevistos), que
 * es lo único que un supervisor puede prevenir interviniendo la línea.
 */
export const PREFIJO_TIPO_IMPREVISTO = 'PN';

/** `true` si el tipo raíz de la parada es una imprevista accionable (rama `PN-*`). */
export function esImprevistaAccionable(tipo: CausaParada | undefined): boolean {
  return (
    tipo?.clasificacion === 'imprevista' && tipo.codigo.startsWith(PREFIJO_TIPO_IMPREVISTO)
  );
}

/** Ventana de la regla anti-fuga corta, en milisegundos. */
const MS_7D = 7 * 86_400_000;
const MS_30D = 30 * 86_400_000;
const MIN_TURNO = 720;

/**
 * Fracción final del corpus reservada a prueba. Debe coincidir con
 * `FRACCION_PRUEBA` de `evaluacion.service.ts`: el corte que define el target
 * y el que evalúa el modelo tienen que ser el mismo, o el target vuelve a ver
 * el futuro.
 */
const FRACCION_PRUEBA_TARGET = 0.3;

/** Franja de positivos dentro de la cual la regla «parada individual» es usable (R2). */
const TASA_POSITIVOS_MIN = 0.15;
const TASA_POSITIVOS_MAX = 0.6;

export interface MuestraCalculada {
  lineaId: string;
  lineaCodigo: string;
  fecha: string;
  turno: Turno;
  modo: ModoMuestra;
  inicioTurno: string;
  features: Record<string, number>;
  huboParadaImprevista: number;
  mermaSobreEstandar: number;
  minutosImprevistos: number;
  tipoCausaDominante: string | null;
  ordenes: number;
}

export interface DatasetConstruido {
  /** Muestras en los dos modos; el despliegue sólo consume las `anticipado`. */
  muestras: MuestraCalculada[];
  catalogo: DefinicionFeature[];
  perfil: PerfilDatos;
}

/** Agregados propios de un turno, antes de mezclarlos con la historia previa. */
interface Grano {
  lineaId: string;
  lineaCodigo: string;
  fecha: string;
  turno: Turno;
  inicioTurno: string;
  instante: number;
  ordenes: OrdenFabricacion[];
  minutosImprevistos: number;
  paradasImprevistas: number;
  minutosPorTipo: Map<string, number>;
  tipoCausaDominante: string | null;
  paradasSinCategorizar: number;
  paradasTotales: number;
  mermaKg: number;
  mermaPasteurizacionKg: number;
  mermaPct: number;
  mermaEstandarPct: number;
  producidoUnid: number;
  velocidadEstandar: number;
  velocidadReal: number;
  oee: { total: number; disponibilidad: number; rendimiento: number; calidad: number };
  familia: string;
  maquinistaId: string;
  minCip: number;
  minArranque: number;
  planificado: number;
}

function fechaMas(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return ahoraIso(d).slice(0, 10);
}

/** Turno `D` arranca 06:00 del día operativo; `N`, 18:00 del mismo día. */
export function inicioDeTurno(fecha: string, turno: Turno): string {
  return `${fecha}T${turno === 'D' ? '06' : '18'}:00:00`;
}

export function finDeTurno(fecha: string, turno: Turno): string {
  return turno === 'D' ? `${fecha}T18:00:00` : `${fechaMas(fecha, 1)}T06:00:00`;
}

function media(valores: number[]): number {
  if (!valores.length) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio]! : (orden[medio - 1]! + orden[medio]!) / 2;
}

function percentil(valores: number[], p: number): number {
  if (!valores.length) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const i = Math.min(orden.length - 1, Math.max(0, Math.round((orden.length - 1) * p)));
  return orden[i]!;
}

function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Fase 3 de CRISP-DM: convierte `orden_fabricacion` + `parada` + `merma` en el
 * feature store `muestra_analitica`, con el grano `línea × fecha × turno × modo`.
 *
 * La pieza crítica es la separación de modos (§4.2, R4): las features históricas
 * se calculan **sólo** con turnos cuyo inicio es estrictamente anterior al del
 * turno objetivo, y las que describen el propio turno (OEE, velocidad real,
 * merma producida) se emiten únicamente en `modo='retro'`. El modelo que se
 * despliega se entrena con `anticipado`, de modo que sus métricas son las que
 * de verdad se pueden reproducir antes de que el turno ocurra.
 */
@Injectable()
export class DatasetBuilderService {
  private readonly logger = new Logger(DatasetBuilderService.name);

  constructor(
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(CausaParada) private readonly causas: Repository<CausaParada>,
    @InjectRepository(Linea) private readonly lineas: Repository<Linea>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
    @InjectRepository(VelocidadEstandar) private readonly pares: Repository<VelocidadEstandar>,
    @InjectRepository(MuestraAnalitica) private readonly muestras: Repository<MuestraAnalitica>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Reconstruye el feature store completo y lo persiste.
   *
   * El borrado y la inserción van **en una sola transacción**: antes eran un
   * `clear()` seguido de un `save()` sueltos, así que durante un segundo la
   * tabla quedaba vacía —la pestaña Modelo podía mostrar «Muestras: 0»— y, si
   * el `save()` fallaba a mitad, el feature store se quedaba vacío o a medias y
   * el entrenamiento siguiente entrenaba sobre un corpus truncado sin avisar.
   */
  async reconstruir(): Promise<DatasetConstruido> {
    const dataset = await this.construir();
    const filas = dataset.muestras.map((m) =>
      this.muestras.create({
        id: `MUE-${m.lineaCodigo}-${m.fecha}-${m.turno}-${m.modo}`,
        lineaId: m.lineaId,
        lineaCodigo: m.lineaCodigo,
        fecha: m.fecha,
        turno: m.turno,
        modo: m.modo,
        inicioTurno: m.inicioTurno,
        features: m.features,
        huboParadaImprevista: m.huboParadaImprevista,
        mermaSobreEstandar: m.mermaSobreEstandar,
        minutosImprevistos: m.minutosImprevistos,
        tipoCausaDominante: m.tipoCausaDominante,
        ordenes: m.ordenes,
        construidaEn: ahoraIso(),
      }),
    );
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MuestraAnalitica);
      await repo.createQueryBuilder().delete().execute();
      await repo.save(filas, { chunk: 200 });
    });
    this.logger.log(
      `Feature store reconstruido: ${filas.length} filas (${dataset.perfil.muestras} por modo)`,
    );
    return dataset;
  }

  /** Construye el dataset en memoria sin escribir en la base. */
  async construir(): Promise<DatasetConstruido> {
    const granos = await this.granos();
    const lineas = await this.lineas.find();
    const catalogo = construirCatalogo(lineas.map((l) => l.codigo));
    const muestras = this.derivar(granos);
    const perfil = await this.perfilar(granos, muestras);
    this.aplicarTarget(granos, muestras, perfil);
    return { muestras, catalogo, perfil };
  }

  /**
   * Muestra `anticipado` de un turno que todavía no ha ocurrido: usa el mismo
   * recorrido histórico que el entrenamiento, añadiendo un grano vacío para el
   * turno objetivo (todavía sin paradas ni producción propias).
   */
  async construirVivo(
    lineaId: string,
    fecha: string,
    turno: Turno,
  ): Promise<MuestraCalculada | null> {
    const lote = await this.construirVivoLote([lineaId], fecha, turno);
    return lote.get(lineaId) ?? null;
  }

  /**
   * Versión por lotes: el ciclo de inferencia puntúa las 9 líneas del mismo
   * turno, y recorrer el corpus una sola vez evita nueve lecturas completas.
   */
  async construirVivoLote(
    lineaIds: readonly string[],
    fecha: string,
    turno: Turno,
  ): Promise<Map<string, MuestraCalculada>> {
    const lineas = await this.lineas.find();
    const porId = new Map(lineas.map((l) => [l.id, l]));
    const granos = await this.granos();
    const inicio = inicioDeTurno(fecha, turno);

    for (const lineaId of lineaIds) {
      const linea = porId.get(lineaId);
      if (!linea) continue;
      const existe = granos.some((g) => g.lineaId === lineaId && g.inicioTurno === inicio);
      if (!existe) granos.push(this.granoVacio(linea, fecha, turno));
    }
    granos.sort((a, b) => a.instante - b.instante || a.lineaCodigo.localeCompare(b.lineaCodigo));

    const muestras = this.derivar(granos);
    const salida = new Map<string, MuestraCalculada>();
    for (const m of muestras) {
      if (m.modo !== 'anticipado' || m.fecha !== fecha || m.turno !== turno) continue;
      if (lineaIds.includes(m.lineaId)) salida.set(m.lineaId, m);
    }
    return salida;
  }

  /* ---------------------------------------------------------------- */
  /* Fase 2 de CRISP-DM: perfilado del corpus                          */
  /* ---------------------------------------------------------------- */

  private async perfilar(granos: Grano[], muestras: MuestraCalculada[]): Promise<PerfilDatos> {
    const [ordenes, paradas, mermas, lineas] = await Promise.all([
      this.ordenes.count(),
      this.paradas.count(),
      this.mermas.count(),
      this.lineas.count(),
    ]);
    const fechas = granos.map((g) => g.fecha).sort();
    const tipos = await this.causas.find({ where: { nivel: 'tipo' } });
    const paradasTotales = granos.reduce((a, g) => a + g.paradasTotales, 0);
    const sinCategorizar = granos.reduce((a, g) => a + g.paradasSinCategorizar, 0);

    /* Nulos que de verdad degradan el modelo, no un `% de nulos` genérico. */
    const columnasConNulos: Record<string, number> = {
      'orden_fabricacion.fin': await this.ordenes.count({ where: { fin: IsNull() } }),
      'orden_fabricacion.velocidadEstandarId': await this.ordenes.count({
        where: { velocidadEstandarId: IsNull() },
      }),
    };

    return {
      ordenes,
      paradas,
      mermas,
      lineas,
      desde: fechas[0] ?? '',
      hasta: fechas[fechas.length - 1] ?? '',
      muestras: muestras.filter((m) => m.modo === 'anticipado').length,
      tasaPositivos: 0,
      reglaTarget: 'parada_individual',
      umbralMinutos: UMBRAL_MIN_PARADA,
      pctParadasSinCategorizar:
        paradasTotales > 0 ? Math.round((sinCategorizar / paradasTotales) * 1000) / 10 : 0,
      tiposCausa: tipos.map((c) => c.codigo).sort(),
      columnasConNulos,
    };
  }

  /**
   * Binariza el target (§4.1 y R2). La regla natural — «hubo una parada
   * imprevista accionable de ≥ 10 min» — sólo se conserva si deja una tasa de
   * positivos utilizable. Con la rama `PN-*` deja el 36 % sobre el corpus de
   * 30 días, así que es la que se usa; si algún corpus futuro la sacase de la
   * franja, se cae a «minutos imprevistos del turno por encima de la mediana
   * del tramo de entrenamiento», la alternativa que el propio plan prevé.
   */
  /**
   * Muestras del tramo de entrenamiento del corte temporal: los días más
   * antiguos, en la misma proporción que `FRACCION_PRUEBA` de la evaluación.
   * Cualquier estadístico que defina el target debe salir de aquí, nunca del
   * corpus completo.
   */
  private tramoEntrenamiento(anticipadas: MuestraCalculada[]): MuestraCalculada[] {
    const dias = [...new Set(anticipadas.map((m) => m.fecha))].sort();
    if (dias.length < 2) return anticipadas;
    const corte = Math.max(1, Math.floor(dias.length * (1 - FRACCION_PRUEBA_TARGET)));
    const hasta = dias[corte - 1]!;
    return anticipadas.filter((m) => m.fecha <= hasta);
  }

  private aplicarTarget(granos: Grano[], muestras: MuestraCalculada[], perfil: PerfilDatos): void {
    const porClave = new Map(granos.map((g) => [`${g.lineaId}|${g.inicioTurno}`, g]));
    const anticipadas = muestras.filter((m) => m.modo === 'anticipado');
    const positivosRegla = anticipadas.filter(
      (m) => (porClave.get(`${m.lineaId}|${m.inicioTurno}`)?.paradasImprevistas ?? 0) > 0,
    ).length;
    const tasaRegla = anticipadas.length ? positivosRegla / anticipadas.length : 0;

    const usarRegla = tasaRegla >= TASA_POSITIVOS_MIN && tasaRegla <= TASA_POSITIVOS_MAX;
    /* El corte se calcula **sólo con el tramo de entrenamiento** (los días más
     * antiguos, con la misma fracción que usa la validación temporal). Tomarlo
     * sobre todas las muestras dejaba que la mediana viese los días que después
     * actúan como prueba: una fuga silenciosa que inflaba las métricas. */
    const corte = mediana(this.tramoEntrenamiento(anticipadas).map((m) => m.minutosImprevistos));

    for (const m of muestras) {
      const g = porClave.get(`${m.lineaId}|${m.inicioTurno}`);
      m.huboParadaImprevista = usarRegla
        ? (g?.paradasImprevistas ?? 0) > 0
          ? 1
          : 0
        : m.minutosImprevistos > corte
          ? 1
          : 0;
    }

    const positivos = anticipadas.filter((m) => m.huboParadaImprevista === 1).length;
    perfil.reglaTarget = usarRegla ? 'parada_individual' : 'minutos_sobre_mediana';
    perfil.umbralMinutos = usarRegla ? UMBRAL_MIN_PARADA : corte;
    perfil.tasaPositivos = anticipadas.length
      ? Math.round((positivos / anticipadas.length) * 1000) / 1000
      : 0;
  }

  /* ---------------------------------------------------------------- */
  /* Granos: agregados propios de cada turno                           */
  /* ---------------------------------------------------------------- */

  private async granos(): Promise<Grano[]> {
    const [ordenes, paradas, mermas, causas, productos, pares] = await Promise.all([
      this.ordenes.find(),
      this.paradas.find(),
      this.mermas.find(),
      this.causas.find(),
      this.productos.find(),
      this.pares.find(),
    ]);
    const lineas = await this.lineas.find();
    const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
    const causaPorId = new Map(causas.map((c) => [c.id, c]));
    const productoPorId = new Map(productos.map((p) => [p.id, p]));
    const parPorId = new Map(pares.map((p) => [p.id, p]));
    const parPorClave = new Map(pares.map((p) => [`${p.productoId}|${p.lineaId}`, p]));

    const paradasPorOrden = new Map<string, Parada[]>();
    for (const p of paradas) {
      const lista = paradasPorOrden.get(p.ordenId);
      if (lista) lista.push(p);
      else paradasPorOrden.set(p.ordenId, [p]);
    }
    const mermasPorOrden = new Map<string, Merma[]>();
    for (const m of mermas) {
      const lista = mermasPorOrden.get(m.ordenId);
      if (lista) lista.push(m);
      else mermasPorOrden.set(m.ordenId, [m]);
    }

    const porClave = new Map<string, OrdenFabricacion[]>();
    for (const o of ordenes) {
      if (!lineaPorId.has(o.lineaId)) continue;
      const clave = `${o.lineaId}|${o.fecha}|${o.turno}`;
      const lista = porClave.get(clave);
      if (lista) lista.push(o);
      else porClave.set(clave, [o]);
    }

    const granos: Grano[] = [];
    for (const [clave, grupo] of porClave) {
      const [lineaId = '', fecha = '', turnoCrudo = 'D'] = clave.split('|');
      const turno = (turnoCrudo === 'N' ? 'N' : 'D') as Turno;
      const linea = lineaPorId.get(lineaId)!;
      const inicioTurno = inicioDeTurno(fecha, turno);

      const paradasTurno = grupo.flatMap((o) => paradasPorOrden.get(o.id) ?? []);
      const mermasTurno = grupo.flatMap((o) => mermasPorOrden.get(o.id) ?? []);

      const minutosPorTipo = new Map<string, number>();
      let minutosImprevistos = 0;
      let paradasImprevistas = 0;
      let minutosOee = 0;
      let sinCategorizar = 0;
      for (const p of paradasTurno) {
        const tipo = causaPorId.get(p.tipoCausaId);
        const hoja = causaPorId.get(p.causaId);
        if (hoja) {
          const nombre = normalizarNombre(hoja.nombre);
          if (nombre === 'otros' || nombre === 'sin categorizar') sinCategorizar += 1;
        } else {
          sinCategorizar += 1;
        }
        if (p.afectaOee) minutosOee += p.duracionMin;
        if (!p.afectaOee || !esImprevistaAccionable(tipo)) continue;
        minutosImprevistos += p.duracionMin;
        if (p.duracionMin >= UMBRAL_MIN_PARADA) paradasImprevistas += 1;
        minutosPorTipo.set(p.tipoCausaId, (minutosPorTipo.get(p.tipoCausaId) ?? 0) + p.duracionMin);
      }
      const dominante = [...minutosPorTipo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const producido = grupo.reduce((a, o) => a + o.producido, 0);
      const planificado = grupo.reduce((a, o) => a + o.planificado, 0);
      const producidoKg = grupo.reduce((a, o) => {
        const peso = productoPorId.get(o.productoId)?.pesoKg ?? 0;
        return a + o.producido * peso;
      }, 0);
      const mermaKg = mermasTurno.reduce((a, m) => a + m.cantidadKg, 0);
      const mermaPasteurizacionKg = mermasTurno
        .filter((m) => m.enviarPasteurizacion)
        .reduce((a, m) => a + m.cantidadKg, 0);

      const parDeOrden = (o: OrdenFabricacion): VelocidadEstandar | undefined =>
        (o.velocidadEstandarId ? parPorId.get(o.velocidadEstandarId) : undefined) ??
        parPorClave.get(`${o.productoId}|${o.lineaId}`);

      const paresTurno = [...new Set(grupo.map((o) => parDeOrden(o)?.id).filter(Boolean))]
        .map((id) => parPorId.get(id as string))
        .filter((p): p is VelocidadEstandar => Boolean(p));

      const velocidadEstandar = media(grupo.map((o) => o.velocidadEstandar).filter((v) => v > 0));
      const minutosOperativos = Math.max(1, MIN_TURNO - minutosOee);
      const velocidadReal = producido / minutosOperativos;

      const mermaPct = producidoKg > 0 ? (mermaKg / producidoKg) * 100 : 0;
      const mermaEstandarPct = media(paresTurno.map((p) => p.mermaEstandarPct).filter((v) => v > 0));

      const saborDominante = productoPorId.get(grupo[0]!.productoId)?.sabor ?? '';

      granos.push({
        lineaId,
        lineaCodigo: linea.codigo,
        fecha,
        turno,
        inicioTurno,
        instante: new Date(inicioTurno).getTime(),
        ordenes: grupo,
        minutosImprevistos,
        paradasImprevistas,
        minutosPorTipo,
        tipoCausaDominante: dominante,
        paradasSinCategorizar: sinCategorizar,
        paradasTotales: paradasTurno.length,
        mermaKg,
        mermaPasteurizacionKg,
        mermaPct,
        mermaEstandarPct,
        producidoUnid: producido,
        velocidadEstandar,
        velocidadReal,
        oee: {
          total: media(grupo.map((o) => o.oee?.oee ?? 0)),
          disponibilidad: media(grupo.map((o) => o.oee?.disponibilidad ?? 0)),
          rendimiento: media(grupo.map((o) => o.oee?.desempeno ?? 0)),
          calidad: media(grupo.map((o) => o.oee?.calidad ?? 0)),
        },
        familia: familiaDeSabor(saborDominante),
        maquinistaId: grupo[0]!.maquinistaId,
        minCip: paresTurno.reduce((a, p) => a + (p.cipMin ?? 0), 0),
        minArranque: paresTurno.reduce((a, p) => a + (p.arranqueMin ?? 0), 0),
        planificado,
      });
    }

    granos.sort((a, b) => a.instante - b.instante || a.lineaCodigo.localeCompare(b.lineaCodigo));
    return granos;
  }

  /** Grano sin producción propia: sirve para puntuar un turno que aún no ocurrió. */
  private granoVacio(linea: Linea, fecha: string, turno: Turno): Grano {
    const inicioTurno = inicioDeTurno(fecha, turno);
    return {
      lineaId: linea.id,
      lineaCodigo: linea.codigo,
      fecha,
      turno,
      inicioTurno,
      instante: new Date(inicioTurno).getTime(),
      ordenes: [],
      minutosImprevistos: 0,
      paradasImprevistas: 0,
      minutosPorTipo: new Map(),
      tipoCausaDominante: null,
      paradasSinCategorizar: 0,
      paradasTotales: 0,
      mermaKg: 0,
      mermaPasteurizacionKg: 0,
      mermaPct: 0,
      mermaEstandarPct: 0,
      producidoUnid: 0,
      velocidadEstandar: linea.capacidadUnidadesMin,
      velocidadReal: 0,
      oee: { total: 0, disponibilidad: 0, rendimiento: 0, calidad: 0 },
      familia: 'otros',
      maquinistaId: '',
      minCip: 0,
      minArranque: 0,
      planificado: 0,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Derivación de features con corte temporal estricto                */
  /* ---------------------------------------------------------------- */

  private derivar(granos: Grano[]): MuestraCalculada[] {
    const porLinea = new Map<string, Grano[]>();
    for (const g of granos) {
      const lista = porLinea.get(g.lineaId);
      if (lista) lista.push(g);
      else porLinea.set(g.lineaId, [g]);
    }

    const codigosLinea = [...new Set(granos.map((g) => g.lineaCodigo))];
    const mermaPcts = granos.map((g) => g.mermaPct).filter((v) => v > 0);
    const mermaP75 = percentil(mermaPcts, 0.75);
    const retrospectivas = nombresRetrospectivos();

    const muestras: MuestraCalculada[] = [];
    for (const [, lista] of porLinea) {
      const experiencia = new Map<string, number>();
      for (let i = 0; i < lista.length; i += 1) {
        const g = lista[i]!;
        const previos = lista.slice(0, i);
        const previo = previos[previos.length - 1];
        const ventana7 = previos.filter((p) => g.instante - p.instante <= MS_7D);
        const ventana30 = previos.filter((p) => g.instante - p.instante <= MS_30D);

        const minutos7 = ventana7.reduce((a, p) => a + p.minutosImprevistos, 0);
        const paradas7 = ventana7.reduce((a, p) => a + p.paradasImprevistas, 0);
        const minutos30 = ventana30.reduce((a, p) => a + p.minutosImprevistos, 0);
        const paradas30 = ventana30.reduce((a, p) => a + p.paradasImprevistas, 0);

        /* MTBF aproximado: minutos productivos de la ventana entre nº de fallas. */
        const mtbf = paradas30 > 0 ? (ventana30.length * MIN_TURNO - minutos30) / paradas30 : MIN_TURNO * 30;

        let racha = 0;
        for (let j = previos.length - 1; j >= 0; j -= 1) {
          if (previos[j]!.paradasImprevistas > 0) break;
          racha += 1;
        }

        const minutosPorTipo7 = new Map<string, number>();
        for (const p of ventana7) {
          for (const [tipo, min] of p.minutosPorTipo) {
            minutosPorTipo7.set(tipo, (minutosPorTipo7.get(tipo) ?? 0) + min);
          }
        }
        const totalTipo7 = [...minutosPorTipo7.values()].reduce((a, b) => a + b, 0);
        const maxTipo7 = Math.max(0, ...minutosPorTipo7.values());
        const concentracion = totalTipo7 > 0 ? maxTipo7 / totalTipo7 : 0;

        const paradasTotales7 = ventana7.reduce((a, p) => a + p.paradasTotales, 0);
        const sinCat7 = ventana7.reduce((a, p) => a + p.paradasSinCategorizar, 0);

        const mermaKg7 = ventana7.reduce((a, p) => a + p.mermaKg, 0);
        const mermaPast7 = ventana7.reduce((a, p) => a + p.mermaPasteurizacionKg, 0);
        const mermaPct7 = media(ventana7.map((p) => p.mermaPct).filter((v) => v > 0));
        const estandar7 = media(ventana7.map((p) => p.mermaEstandarPct).filter((v) => v > 0));

        const capacidad = g.velocidadEstandar > 0 ? g.velocidadEstandar * MIN_TURNO : 0;
        const maquinistas = new Set(g.ordenes.map((o) => o.maquinistaId));
        const productos = new Set(g.ordenes.map((o) => o.productoId));
        const expMaquinista = experiencia.get(g.maquinistaId) ?? 0;
        const arranque = !previo || g.instante - previo.instante > MIN_TURNO * 60_000 + 1;

        const base: Record<string, number> = {
          diaSemana: new Date(`${g.fecha}T00:00:00`).getDay(),
          esFinDeSemana: [0, 6].includes(new Date(`${g.fecha}T00:00:00`).getDay()) ? 1 : 0,
          diaDelMes: Number(g.fecha.slice(8, 10)),
          turnoEsNoche: g.turno === 'N' ? 1 : 0,

          nOrdenesTurno: g.ordenes.length,
          nCambiosProducto: Math.max(0, productos.size - 1),
          ratioPlanCapacidad: capacidad > 0 ? g.planificado / capacidad : 0,
          velocidadEstandarUnidMin: g.velocidadEstandar,

          paradasImprev7d: paradas7,
          minParadasImprev7d: minutos7,
          rachaSinParada: racha,

          paradasImprev30d: paradas30,
          minParadasImprev30d: minutos30,
          mtbfAprox: mtbf,

          pctCausaFallas7d: concentracion,
          pctParadasSinCategorizar7d: paradasTotales7 > 0 ? sinCat7 / paradasTotales7 : 0,

          mermaKg7d: mermaKg7,
          mermaKgTurnoPrevio: previo?.mermaKg ?? 0,
          mermaPctVsEstandar7d: estandar7 > 0 ? mermaPct7 / estandar7 : 0,
          mermaPasteurizacionPct7d: mermaKg7 > 0 ? mermaPast7 / mermaKg7 : 0,

          esArranqueLinea: arranque ? 1 : 0,
          minCipPrevistos: g.minCip,
          minArranquePrevistos: g.minArranque,

          maquinistaExpTurnos: expMaquinista,
          cambioDeMaquinista: previo && previo.maquinistaId !== g.maquinistaId ? 1 : 0,

          oeeTurnoPrevio: previo?.oee.total ?? 0,
          desvioVelocidadTurnoPrevio: previo
            ? calcDesvioVelocidad(previo.velocidadReal, previo.velocidadEstandar)
            : 0,
        };
        for (const codigo of codigosLinea) {
          base[nombreFeatureLinea(codigo)] = codigo === g.lineaCodigo ? 1 : 0;
        }
        for (const familia of ['vainilla', 'chocolate', 'trisabor', 'otros'] as const) {
          base[nombreFeatureFamilia(familia)] = g.familia === familia ? 1 : 0;
        }

        const propias: Record<string, number> = {
          oeeTotal: g.oee.total,
          oeeDisponibilidad: g.oee.disponibilidad,
          oeeRendimiento: g.oee.rendimiento,
          oeeCalidad: g.oee.calidad,
          velocidadRealUnidMin: g.velocidadReal,
          desvioVelocidadPct: calcDesvioVelocidad(g.velocidadReal, g.velocidadEstandar),
          mermaKgTurno: g.mermaKg,
        };

        const estandarPar = g.mermaEstandarPct > 0 ? g.mermaEstandarPct : mermaP75;
        const mermaSobre = g.mermaPct > 0 && estandarPar > 0 && g.mermaPct > estandarPar ? 1 : 0;

        const comun = {
          lineaId: g.lineaId,
          lineaCodigo: g.lineaCodigo,
          fecha: g.fecha,
          turno: g.turno,
          inicioTurno: g.inicioTurno,
          huboParadaImprevista: 0,
          mermaSobreEstandar: mermaSobre,
          minutosImprevistos: g.minutosImprevistos,
          tipoCausaDominante: g.tipoCausaDominante,
          ordenes: g.ordenes.length,
        };

        /* Guardarraíl de la regla anti-fuga: una muestra `anticipado` nunca
         * puede llevar una feature marcada como retrospectiva. */
        const anticipado: Record<string, number> = { ...base };
        for (const nombre of retrospectivas) delete anticipado[nombre];

        muestras.push({ ...comun, modo: 'anticipado', features: anticipado });
        muestras.push({ ...comun, modo: 'retro', features: { ...base, ...propias } });

        if (g.maquinistaId) {
          for (const id of maquinistas) experiencia.set(id, (experiencia.get(id) ?? 0) + 1);
        }
      }
    }

    muestras.sort(
      (a, b) =>
        a.inicioTurno.localeCompare(b.inicioTurno) || a.lineaCodigo.localeCompare(b.lineaCodigo),
    );
    return muestras;
  }
}
