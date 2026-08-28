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
 * exactamente los porcentajes de la spec 06.A (10 080 min planificados = 7 d × 3 turnos).
 */
const HECHOS_LINEA: Record<string, { paradasMin: number; producidas: number; buenas: number }> = {
  'LIN-01': { paradasMin: 662, producidas: 801610, buenas: 786329 },
  'LIN-02': { paradasMin: 803, producidas: 1002979, buenas: 983872 },
  'LIN-03': { paradasMin: 1116, producidas: 871609, buenas: 848026 },
  'LIN-04': { paradasMin: 1590, producidas: 598325, buenas: 579129 },
  'LIN-05': { paradasMin: 854, producidas: 1148218, buenas: 1122907 },
};

const PLANIFICADO_LINEA_MIN = 10080;

const TURNOS_OEE = [
  { turno: 'M' as const, turnoLabel: 'Mañana', oee: 81.4, disponibilidad: 92.3, desempeno: 90.2, calidad: 97.8, deltaOee: 1.9 },
  { turno: 'T' as const, turnoLabel: 'Tarde', oee: 78.2, disponibilidad: 89.4, desempeno: 89.6, calidad: 97.6, deltaOee: 0.6 },
  { turno: 'N' as const, turnoLabel: 'Noche', oee: 76.9, disponibilidad: 88.1, desempeno: 88.7, calidad: 96.9, deltaOee: -0.8 },
];

/**
 * Paradas por causa raíz. `minutosPorTurno` reproduce el heatmap causa × turno
 * de Analítica (spec 08.B) y su suma es el minutaje del Pareto (spec 06.B).
 */
const CAUSAS_PARADA = [
  { codigo: 'PM-01', nombre: 'Falla mecánica', categoria: 'fallas' as const, cantidad: 14, turnos: [38, 72, 32], linea: 'L2 Conos', tendencia: [18, 24, 21, 27, 22, 16, 14] },
  { codigo: 'PL-03', nombre: 'Limpieza CIP', categoria: 'rutinarias' as const, cantidad: 11, turnos: [42, 31, 23], linea: 'L3 Vasos', tendencia: [12, 14, 13, 15, 14, 13, 15] },
  { codigo: 'PC-04', nombre: 'Cambio de producto', categoria: 'rutinarias' as const, cantidad: 8, turnos: [26, 41, 21], linea: 'L1 Paletas', tendencia: [9, 11, 14, 12, 15, 13, 14] },
  { codigo: 'PA-05', nombre: 'Falta de insumo', categoria: 'imprevistas' as const, cantidad: 6, turnos: [17, 21, 13], linea: 'L5 Bombones', tendencia: [6, 8, 7, 9, 7, 8, 6] },
  { codigo: 'PO-06', nombre: 'Ajuste operativo', categoria: 'imprevistas' as const, cantidad: 5, turnos: [14, 19, 11], linea: 'L4 Sándwich', tendencia: [5, 6, 7, 6, 7, 6, 7] },
  { codigo: 'PE-02', nombre: 'Falla eléctrica', categoria: 'fallas' as const, cantidad: 3, turnos: [11, 15, 11], linea: 'L3 Vasos', tendencia: [4, 6, 5, 7, 5, 6, 4] },
  { codigo: 'PS-07', nombre: 'Sin personal', categoria: 'imprevistas' as const, cantidad: 1, turnos: [4, 6, 8], linea: 'L4 Sándwich', tendencia: [2, 3, 2, 4, 2, 3, 2] },
];

/** Donut de la spec 06.B: los 612 min del KPI repartidos en tres categorías. */
const CATEGORIAS_PARADA = [
  { clave: 'rutinarias' as const, label: 'Rutinarias', minutos: 230 },
  { clave: 'imprevistas' as const, label: 'Imprevistas', minutos: 138 },
  { clave: 'fallas' as const, label: 'Fallas', minutos: 244 },
];

/** Merma por línea y tipo (kg). Total 412 kg. */
const MERMA_LINEAS: Record<string, [number, number, number]> = {
  'LIN-01': [18, 42, 21],
  'LIN-02': [22, 58, 26],
  'LIN-03': [16, 51, 19],
  'LIN-04': [14, 37, 24],
  'LIN-05': [11, 34, 19],
};

/** Merma por causa y turno (kg). Suma por fila = kg de la tabla de detalle. */
const MERMA_CAUSAS = [
  { codigo: 'MR-01', nombre: 'Sobrepeso', turnos: [41, 52, 34], tipo: 'PT' as const, linea: 'L2 Conos' },
  { codigo: 'MR-02', nombre: 'Rotura', turnos: [28, 39, 26], tipo: 'PT' as const, linea: 'L4 Sándwich' },
  { codigo: 'MR-03', nombre: 'Arranque', turnos: [46, 38, 29], tipo: 'EP' as const, linea: 'L3 Vasos' },
  { codigo: 'MR-04', nombre: 'Contaminación', turnos: [12, 41, 26], tipo: 'MP' as const, linea: 'L1 Paletas' },
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
