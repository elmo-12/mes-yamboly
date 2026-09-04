import type { DataSource } from 'typeorm';
import {
  ExportJob,
  IndicadorDiario,
  IndicadorKpi,
  IndicadorLinea,
  IndicadorTurno,
  MermaAgregada,
  MermaCausa,
  ParadaAgregada,
  ParadaCategoria,
} from '../entities';
import { LINEAS_TESIS, fechaMenos, iso, pad, rng } from './thesis-seed.util';
import type { Seeder } from './seeder.interface';

/**
 * Reportes (spec 06). Los hechos por línea guardan magnitudes crudas para que
 * `computeOee()` derive los porcentajes; el resto de agregados reproduce las
 * cifras del prototipo: OEE 79,8 % · 48 paradas / 612 min · 412 kg de merma.
 */

/** OEE diario de los últimos 7 días (el más antiguo primero). */
const OEE_SEMANA = [77.1, 78.6, 80.2, 79.4, 81.0, 78.9, 79.8];

const KPIS_INDICADORES = [
  { clave: 'oee', label: 'OEE', valor: 79.8, unidad: '%', meta: 85, delta: 1.4, deltaAnio: 4.2 },
  { clave: 'disponibilidad', label: 'Disponibilidad', valor: 90.6, unidad: '%', meta: null, delta: 0.8, deltaAnio: 2.1 },
  { clave: 'desempeno', label: 'Desempeño', valor: 89.1, unidad: '%', meta: null, delta: 1.1, deltaAnio: 3.0 },
  { clave: 'calidad', label: 'Calidad', valor: 97.4, unidad: '%', meta: null, delta: -0.3, deltaAnio: 0.4 },
];

const KPIS_PARADAS = [
  { clave: 'paradas', label: 'Paradas', valor: 48, unidad: '', meta: null, delta: -4, deltaAnio: -9 },
  { clave: 'minutos', label: 'Minutos', valor: 612, unidad: 'min', meta: null, delta: -37, deltaAnio: -114 },
  { clave: 'mttr', label: 'MTTR', valor: 12.8, unidad: 'min', meta: null, delta: -0.6, deltaAnio: -1.4 },
  { clave: 'pct_tiempo', label: '% tiempo', valor: 4.3, unidad: '%', meta: null, delta: -0.3, deltaAnio: -0.9 },
];

const KPIS_MERMAS = [
  { clave: 'merma_total', label: 'Merma total', valor: 412, unidad: 'kg', meta: null, delta: -18, deltaAnio: -63 },
  { clave: 'merma_pct', label: '% sobre producción', valor: 2.3, unidad: '%', meta: null, delta: -0.4, deltaAnio: -0.7 },
  { clave: 'merma_costo', label: 'Costo estimado', valor: 3860, unidad: 'S/', meta: null, delta: -170, deltaAnio: -590 },
  { clave: 'baldes', label: 'Baldes a pasteurizar', valor: 26, unidad: '', meta: null, delta: -2, deltaAnio: -5 },
];

/** Los KPI donde subir es bueno; el resto se marca `favorableSiSube: false`. */
const FAVORABLE_SI_SUBE = new Set(['oee', 'disponibilidad', 'desempeno', 'calidad']);

/**
 * Magnitudes crudas por línea calculadas para que `computeOee()` devuelva
 * exactamente los porcentajes de la spec 06.A
 * (10 080 min planificados = 7 d × 2 turnos × 720 min).
 */
const HECHOS_LINEA: Record<string, { paradasMin: number; producidas: number; buenas: number }> = {
  'LIN-EXTR-2': { paradasMin: 665, producidas: 3796128, buenas: 3724002 },
  'LIN-EXTR-3': { paradasMin: 806, producidas: 2172527, buenas: 2131249 },
  'LIN-LLEN-A1': { paradasMin: 1119, producidas: 2221987, buenas: 2161993 },
  'LIN-LLEN-A2': { paradasMin: 1593, producidas: 2392655, buenas: 2316090 },
  'LIN-LLEN-M1': { paradasMin: 857, producidas: 368966, buenas: 360849 },
  'LIN-LLEN-M2': { paradasMin: 988, producidas: 406412, buenas: 396658 },
  'LIN-MOLD-A2': { paradasMin: 696, producidas: 2550571, buenas: 2507211 },
  'LIN-MOLD-A3': { paradasMin: 1371, producidas: 2657987, buenas: 2580905 },
  'LIN-MOLD-A4': { paradasMin: 1038, producidas: 3928629, buenas: 3846128 },
};

const PLANIFICADO_LINEA_MIN = 10080;

const TURNOS_OEE = [
  { turno: 'D' as const, turnoLabel: 'Día', oee: 81.4, disponibilidad: 92.3, desempeno: 90.2, calidad: 97.8, deltaOee: 1.9 },
  { turno: 'N' as const, turnoLabel: 'Noche', oee: 77.1, disponibilidad: 88.8, desempeno: 89.2, calidad: 97.3, deltaOee: -0.5 },
];

/**
 * Paradas por tipo raíz del árbol real. `minutosPorTurno` reproduce el heatmap
 * causa × turno de Analítica (spec 08.B, 5 tipos × 2 turnos) y su suma es el
 * minutaje del Pareto (spec 06.B): 476 min y 48 paradas.
 */
const CAUSAS_PARADA = [
  { codigo: 'PN-02', nombre: 'Paro por fallas', categoria: 'fallas' as const, cantidad: 14, turnos: [96, 83], linea: 'MOLD-A3 Moldeadora A3', tendencia: [24, 28, 25, 31, 26, 23, 22] },
  { codigo: 'PP-01', nombre: 'Paro rutinario (planificado)', categoria: 'rutinarias' as const, cantidad: 13, turnos: [72, 62], linea: 'LLEN-M1 Llenadora M1', tendencia: [17, 20, 19, 22, 20, 18, 18] },
  { codigo: 'PN-04', nombre: 'Paro imprevisto', categoria: 'imprevistas' as const, cantidad: 10, turnos: [45, 38], linea: 'LLEN-A2 Llenadora A2', tendencia: [10, 13, 11, 14, 12, 12, 11] },
  { codigo: 'PN-03', nombre: 'Demoras', categoria: 'imprevistas' as const, cantidad: 7, turnos: [26, 24], linea: 'EXTR-3 Extrusora 3', tendencia: [6, 8, 7, 9, 7, 7, 6] },
  { codigo: 'PS-05', nombre: 'Paro sin programa', categoria: 'rutinarias' as const, cantidad: 4, turnos: [17, 13], linea: 'MOLD-A4 Moldeadora A4', tendencia: [4, 5, 4, 5, 4, 4, 4] },
];

/** Donut de la spec 06.B: los 612 min del KPI repartidos en tres categorías. */
const CATEGORIAS_PARADA = [
  { clave: 'rutinarias' as const, label: 'Rutinarias', minutos: 211 },
  { clave: 'imprevistas' as const, label: 'Imprevistas', minutos: 171 },
  { clave: 'fallas' as const, label: 'Fallas', minutos: 230 },
];

/** Merma por línea y tipo (kg). Total 412 kg. */
const MERMA_LINEAS: Record<string, [number, number, number]> = {
  'LIN-EXTR-2': [9, 24, 11],
  'LIN-EXTR-3': [7, 18, 9],
  'LIN-LLEN-A1': [8, 22, 10],
  'LIN-LLEN-A2': [6, 17, 8],
  'LIN-LLEN-M1': [10, 26, 12],
  'LIN-LLEN-M2': [11, 29, 13],
  'LIN-MOLD-A2': [9, 25, 12],
  'LIN-MOLD-A3': [12, 33, 15],
  'LIN-MOLD-A4': [11, 32, 13],
};

/** Merma por tipo raíz y turno (kg). Suma total = 412 kg de la spec 06.C. */
const MERMA_CAUSAS = [
  { codigo: 'MP-01', nombre: 'Merma del proceso', turnos: [78, 62], tipo: 'EP' as const, linea: 'MOLD-A3 Moldeadora A3' },
  { codigo: 'MP-03', nombre: 'Merma por fallas operativas', turnos: [56, 47], tipo: 'EP' as const, linea: 'MOLD-A4 Moldeadora A4' },
  { codigo: 'MP-02', nombre: 'Merma por desvío del proceso', turnos: [48, 40], tipo: 'PT' as const, linea: 'LLEN-M2 Llenadora M2' },
  { codigo: 'MP-04', nombre: 'Merma por fallas de mantenimiento', turnos: [30, 25], tipo: 'MP' as const, linea: 'EXTR-2 Extrusora 2' },
  { codigo: 'MP-05', nombre: 'Merma por fallas externas', turnos: [14, 12], tipo: 'MP' as const, linea: 'LLEN-M1 Llenadora M1' },
];

export class ThesisReportsSeeder implements Seeder {
  readonly name = 'reportes (indicadores, paradas, mermas, exportaciones)';

  async run(dataSource: DataSource): Promise<void> {
    await this.seedKpis(dataSource);
    await this.seedDiario(dataSource);
    await this.seedLineas(dataSource);
    await this.seedTurnos(dataSource);
    await this.seedParadas(dataSource);
    await this.seedMermas(dataSource);
    await this.seedExportaciones(dataSource);
  }

  private async seedKpis(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(IndicadorKpi);
    if (await repo.count()) return;
    const grupos: [IndicadorKpi['ambito'], typeof KPIS_INDICADORES][] = [
      ['indicadores', KPIS_INDICADORES],
      ['paradas', KPIS_PARADAS],
      ['mermas', KPIS_MERMAS],
    ];
    const filas = grupos.flatMap(([ambito, kpis]) =>
      kpis.map((k, i) =>
        repo.create({
          id: `KPI-${ambito}-${k.clave}`,
          ambito,
          clave: k.clave,
          label: k.label,
          valor: k.valor,
          unidad: k.unidad,
          meta: k.meta,
          deltaValor: k.delta,
          deltaUnidad: k.unidad === '%' ? 'pp' : k.unidad,
          deltaFavorableSiSube: FAVORABLE_SI_SUBE.has(k.clave),
          deltaAnioValor: k.deltaAnio,
          orden: i,
        }),
      ),
    );
    await repo.save(filas);
  }

  private async seedDiario(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(IndicadorDiario);
    if (await repo.count()) return;
    /* `rng(606)` es el mismo generador del mock: la serie predicho/real coincide. */
    const r = rng(606);
    const oeeHistorico = rng(101);
    const filas: IndicadorDiario[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const fecha = fechaMenos(i);
      const predicho = r.int(4, 11);
      const real = Math.max(2, predicho + r.int(-2, 2));
      const oee = i <= 6 ? OEE_SEMANA[6 - i]! : oeeHistorico.float(75.4, 81.6, 1);
      filas.push(
        repo.create({
          id: `IND-DIA-${fecha}`,
          fecha,
          oee,
          meta: 85,
          prediccionesPredichas: predicho,
          prediccionesReales: real,
        }),
      );
    }
    await repo.save(filas);
  }

  private async seedLineas(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(IndicadorLinea);
    if (await repo.count()) return;
    const filas = LINEAS_TESIS.map((linea, i) => {
      const hecho = HECHOS_LINEA[linea.lineaId]!;
      return repo.create({
        id: `IND-LIN-${linea.lineaId}`,
        lineaId: linea.lineaId,
        lineaCodigo: linea.lineaCodigo,
        lineaNombre: linea.lineaNombre,
        tiempoPlanificadoMin: PLANIFICADO_LINEA_MIN,
        paradasMin: hecho.paradasMin,
        unidadesProducidas: hecho.producidas,
        unidadesBuenas: hecho.buenas,
        velocidadEstandar: linea.velocidadEstandar,
        orden: i,
      });
    });
    await repo.save(filas);
  }

  private async seedTurnos(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(IndicadorTurno);
    if (await repo.count()) return;
    await repo.save(
      TURNOS_OEE.map((t, i) => repo.create({ id: `IND-TUR-${t.turno}`, ...t, orden: i })),
    );
  }

  private async seedParadas(ds: DataSource): Promise<void> {
    const repoCausa = ds.getRepository(ParadaAgregada);
    if (!(await repoCausa.count())) {
      await repoCausa.save(
        CAUSAS_PARADA.map((c, i) =>
          repoCausa.create({
            id: `PAR-AGG-${c.codigo}`,
            causaId: `CPA-${c.codigo}`,
            causaCodigo: c.codigo,
            causaNombre: c.nombre,
            categoria: c.categoria,
            cantidad: c.cantidad,
            minutos: c.turnos.reduce((a, b) => a + b, 0),
            lineaMasAfectada: c.linea,
            tendencia: c.tendencia,
            minutosPorTurno: c.turnos,
            orden: i,
          }),
        ),
      );
    }
    const repoCat = ds.getRepository(ParadaCategoria);
    if (!(await repoCat.count())) {
      await repoCat.save(
        CATEGORIAS_PARADA.map((c, i) => repoCat.create({ id: `PAR-CAT-${c.clave}`, ...c, orden: i })),
      );
    }
  }

  private async seedMermas(ds: DataSource): Promise<void> {
    const repoLinea = ds.getRepository(MermaAgregada);
    if (!(await repoLinea.count())) {
      await repoLinea.save(
        LINEAS_TESIS.map((linea, i) => {
          const [mp, ep, pt] = MERMA_LINEAS[linea.lineaId]!;
          return repoLinea.create({
            id: `MER-AGG-${linea.lineaId}`,
            lineaId: linea.lineaId,
            lineaCodigo: linea.lineaCodigo,
            lineaNombre: linea.lineaNombre,
            mp,
            ep,
            pt,
            orden: i,
          });
        }),
      );
    }
    const repoCausa = ds.getRepository(MermaCausa);
    if (!(await repoCausa.count())) {
      await repoCausa.save(
        MERMA_CAUSAS.map((c, i) =>
          repoCausa.create({
            id: `MER-CAU-${c.codigo}`,
            causaId: `CME-${c.codigo}`,
            causaCodigo: c.codigo,
            causaNombre: c.nombre,
            tipoPredominante: c.tipo,
            lineaMasAfectada: c.linea,
            kgPorTurno: c.turnos,
            orden: i,
          }),
        ),
      );
    }
  }

  private async seedExportaciones(ds: DataSource): Promise<void> {
    const repo = ds.getRepository(ExportJob);
    if (await repo.count()) return;
    await repo.save([
      repo.create({ id: 'EXP-004', nombre: 'Órdenes y paradas · agosto 2026', datasets: ['ordenes', 'paradas'], formato: 'xlsx', solicitadoEn: iso(fechaMenos(0), '09:12'), solicitadoPor: 'Carlos Mendoza', estado: 'listo', tamano: '2,4 MB', url: '/api/v1/reportes/exportaciones/EXP-004/descargar' }),
      repo.create({ id: 'EXP-003', nombre: 'Indicadores OEE · semana 34', datasets: ['indicadores'], formato: 'pdf', solicitadoEn: iso(fechaMenos(1), '16:44'), solicitadoPor: 'Ana Ríos', estado: 'listo', tamano: '860 KB', url: '/api/v1/reportes/exportaciones/EXP-003/descargar' }),
      repo.create({ id: 'EXP-002', nombre: 'Mermas por causa · agosto 2026', datasets: ['mermas'], formato: 'csv', solicitadoEn: iso(fechaMenos(2), '11:02'), solicitadoPor: 'María Torres', estado: 'listo', tamano: '412 KB', url: '/api/v1/reportes/exportaciones/EXP-002/descargar' }),
      repo.create({ id: 'EXP-001', nombre: 'Evidencia TRI/TCI para SPSS', datasets: ['evidencia'], formato: 'csv', solicitadoEn: iso(fechaMenos(3), '08:30'), solicitadoPor: 'Investigador Tesis', estado: 'generando' }),
    ]);
  }
}

/** Ids consecutivos de exportación (`EXP-005`, `EXP-006`, …). */
export function siguienteIdExport(ultimo: string | undefined): string {
  const n = ultimo ? Number(ultimo.replace(/\D/g, '')) : 4;
  return `EXP-${pad(n + 1, 3)}`;
}
