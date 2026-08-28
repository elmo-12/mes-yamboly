import type {
  ComparativaTurno,
  DetalleCausaMerma,
  DetalleCausaParada,
  DonutSegmento,
  HeatmapCelda,
  KpiValor,
  MermaApiladaLinea,
  OeePorLinea,
  ParetoParada,
  TendenciaOeePunto,
} from '@mes/types';
import { fechaMenos, redondear } from './seed';

/** Valores fijos de Reportes (spec 06) y del Home (spec 02.C). */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaFecha(isoFecha: string): string {
  const d = new Date(`${isoFecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/* ------------------------------------------------------------------ */
/* Home — spec 02.C                                                    */
/* ------------------------------------------------------------------ */

export const homeKpis: KpiValor[] = [
  { id: 'oee', label: 'OEE del día', valor: 78.4, unidad: '%', meta: 85, delta: { valor: 2.1, unidad: 'pp', favorableSiSube: true, referencia: 'vs ayer' } },
  { id: 'disponibilidad', label: 'Disponibilidad', valor: 91.2, unidad: '%' },
  { id: 'desempeno', label: 'Desempeño', valor: 88.7, unidad: '%' },
  { id: 'calidad', label: 'Calidad', valor: 96.9, unidad: '%' },
];

export const homeKpisSecundarios: KpiValor[] = [
  { id: 'merma', label: 'Merma', valor: 2.3, unidad: '%', delta: { valor: -0.4, unidad: 'pp', favorableSiSube: false, referencia: 'vs ayer' } },
  { id: 'paradas_no_programadas', label: 'Paradas no programadas', valor: 7, unidad: '', meta: 42 },
  { id: 'tri', label: 'Tiempo medio de registro', valor: 1.4, unidad: 'min', delta: { valor: -48, unidad: '%', favorableSiSube: false, referencia: 'vs pretest' } },
];

/** Minutos de las paradas no programadas del día (7 paradas · 42 min). */
export const HOME_PARADAS_MINUTOS = 42;

/** "Top causas de parada (semana)" — spec 02.C. */
export const topCausasSemana: { causaCodigo: string; causaNombre: string; minutos: number }[] = [
  { causaCodigo: 'PM-01', causaNombre: 'Falla mecánica', minutos: 142 },
  { causaCodigo: 'PL-03', causaNombre: 'Limpieza CIP', minutos: 96 },
  { causaCodigo: 'PC-04', causaNombre: 'Cambio de producto', minutos: 88 },
  { causaCodigo: 'PA-05', causaNombre: 'Falta de insumo', minutos: 51 },
  { causaCodigo: 'PE-02', causaNombre: 'Falla eléctrica', minutos: 37 },
];

/* ------------------------------------------------------------------ */
/* Indicadores — spec 06.A                                             */
/* ------------------------------------------------------------------ */

export const indicadoresKpis: KpiValor[] = [
  { id: 'oee', label: 'OEE', valor: 79.8, unidad: '%', meta: 85, delta: { valor: 1.4, unidad: 'pp', favorableSiSube: true, referencia: 'vs periodo anterior' } },
  { id: 'disponibilidad', label: 'Disponibilidad', valor: 90.6, unidad: '%', delta: { valor: 0.8, unidad: 'pp', favorableSiSube: true, referencia: 'vs periodo anterior' } },
  { id: 'desempeno', label: 'Desempeño', valor: 89.1, unidad: '%', delta: { valor: 1.1, unidad: 'pp', favorableSiSube: true, referencia: 'vs periodo anterior' } },
  { id: 'calidad', label: 'Calidad', valor: 97.4, unidad: '%', delta: { valor: -0.3, unidad: 'pp', favorableSiSube: true, referencia: 'vs periodo anterior' } },
];

const OEE_DIARIO = [77.1, 78.6, 80.2, 79.4, 81.0, 78.9, 79.8];

export const tendenciaOee: TendenciaOeePunto[] = OEE_DIARIO.map((oee, i) => {
  const fecha = fechaMenos(6 - i);
  return { fecha, etiqueta: etiquetaFecha(fecha), oee, meta: 85 };
});

export const oeePorLinea: OeePorLinea[] = [
  { lineaId: 'LIN-01', lineaCodigo: 'L1', lineaNombre: 'Paletas', oee: 82.1, disponibilidad: 93.4, desempeno: 89.6, calidad: 98.1 },
  { lineaId: 'LIN-02', lineaCodigo: 'L2', lineaNombre: 'Conos', oee: 81.3, disponibilidad: 92.0, desempeno: 90.1, calidad: 98.1 },
  { lineaId: 'LIN-03', lineaCodigo: 'L3', lineaNombre: 'Vasos', oee: 76.5, disponibilidad: 88.9, desempeno: 88.4, calidad: 97.3 },
  { lineaId: 'LIN-04', lineaCodigo: 'L4', lineaNombre: 'Sándwich', oee: 71.8, disponibilidad: 84.2, desempeno: 88.1, calidad: 96.8 },
  { lineaId: 'LIN-05', lineaCodigo: 'L5', lineaNombre: 'Bombones', oee: 79.6, disponibilidad: 91.5, desempeno: 88.9, calidad: 97.8 },
];

export const comparativaTurno: ComparativaTurno[] = [
  { turno: 'M', turnoLabel: 'Mañana', oee: 81.4, disponibilidad: 92.3, desempeno: 90.2, calidad: 97.8, deltaOee: 1.9 },
  { turno: 'T', turnoLabel: 'Tarde', oee: 78.2, disponibilidad: 89.4, desempeno: 89.6, calidad: 97.6, deltaOee: 0.6 },
  { turno: 'N', turnoLabel: 'Noche', oee: 76.9, disponibilidad: 88.1, desempeno: 88.7, calidad: 96.9, deltaOee: -0.8 },
];

/* ------------------------------------------------------------------ */
/* Paradas — spec 06.B                                                 */
/* ------------------------------------------------------------------ */

export const paradasKpis: KpiValor[] = [
  { id: 'paradas', label: 'Paradas', valor: 48, unidad: '' },
  { id: 'minutos', label: 'Minutos', valor: 612, unidad: 'min' },
  { id: 'mttr', label: 'MTTR', valor: 12.8, unidad: 'min' },
  { id: 'pct_tiempo', label: '% tiempo', valor: 4.3, unidad: '%' },
];

const PARETO_BASE = [
  { causaCodigo: 'PM-01', causaNombre: 'Falla mecánica', minutos: 142 },
  { causaCodigo: 'PL-03', causaNombre: 'Limpieza CIP', minutos: 96 },
  { causaCodigo: 'PC-04', causaNombre: 'Cambio de producto', minutos: 88 },
  { causaCodigo: 'PA-05', causaNombre: 'Falta de insumo', minutos: 51 },
  { causaCodigo: 'PO-06', causaNombre: 'Ajuste operativo', minutos: 44 },
  { causaCodigo: 'PE-02', causaNombre: 'Falla eléctrica', minutos: 37 },
  { causaCodigo: 'PS-07', causaNombre: 'Sin personal', minutos: 18 },
];

const TOTAL_PARETO = PARETO_BASE.reduce((a, c) => a + c.minutos, 0);

export const paretoParadas: ParetoParada[] = (() => {
  let acumulado = 0;
  return PARETO_BASE.map((c) => {
    acumulado += c.minutos;
    return { ...c, acumuladoPct: redondear((acumulado / TOTAL_PARETO) * 100) };
  });
})();

export const donutParadas: DonutSegmento[] = [
  { clave: 'rutinarias', label: 'Rutinarias', valor: 184, pct: redondear((184 / TOTAL_PARETO) * 100) },
  { clave: 'imprevistas', label: 'Imprevistas', valor: 113, pct: redondear((113 / TOTAL_PARETO) * 100) },
  { clave: 'fallas', label: 'Fallas', valor: 179, pct: redondear((179 / TOTAL_PARETO) * 100) },
];

export const detallePorCausaParada: DetalleCausaParada[] = [
  { causaId: 'CPA-PM-01', causaCodigo: 'PM-01', causaNombre: 'Falla mecánica', cantidad: 14, minutos: 142, pct: redondear((142 / TOTAL_PARETO) * 100), lineaMasAfectada: 'L2 Conos', tendencia: [18, 24, 21, 27, 22, 16, 14] },
  { causaId: 'CPA-PL-03', causaCodigo: 'PL-03', causaNombre: 'Limpieza CIP', cantidad: 11, minutos: 96, pct: redondear((96 / TOTAL_PARETO) * 100), lineaMasAfectada: 'L3 Vasos', tendencia: [12, 14, 13, 15, 14, 13, 15] },
  { causaId: 'CPA-PC-04', causaCodigo: 'PC-04', causaNombre: 'Cambio de producto', cantidad: 8, minutos: 88, pct: redondear((88 / TOTAL_PARETO) * 100), lineaMasAfectada: 'L1 Paletas', tendencia: [9, 11, 14, 12, 15, 13, 14] },
  { causaId: 'CPA-PA-05', causaCodigo: 'PA-05', causaNombre: 'Falta de insumo', cantidad: 6, minutos: 51, pct: redondear((51 / TOTAL_PARETO) * 100), lineaMasAfectada: 'L5 Bombones', tendencia: [6, 8, 7, 9, 7, 8, 6] },
  { causaId: 'CPA-PO-06', causaCodigo: 'PO-06', causaNombre: 'Ajuste operativo', cantidad: 5, minutos: 44, pct: redondear((44 / TOTAL_PARETO) * 100), lineaMasAfectada: 'L4 Sándwich', tendencia: [5, 6, 7, 6, 7, 6, 7] },
  { causaId: 'CPA-PE-02', causaCodigo: 'PE-02', causaNombre: 'Falla eléctrica', cantidad: 3, minutos: 37, pct: redondear((37 / TOTAL_PARETO) * 100), lineaMasAfectada: 'L3 Vasos', tendencia: [4, 6, 5, 7, 5, 6, 4] },
  { causaId: 'CPA-PS-07', causaCodigo: 'PS-07', causaNombre: 'Sin personal', cantidad: 1, minutos: 18, pct: redondear((18 / TOTAL_PARETO) * 100), lineaMasAfectada: 'L4 Sándwich', tendencia: [2, 3, 2, 4, 2, 3, 2] },
];

/* ------------------------------------------------------------------ */
/* Mermas — spec 06.C                                                  */
/* ------------------------------------------------------------------ */

export const mermasKpis: KpiValor[] = [
  { id: 'merma_total', label: 'Merma total', valor: 412, unidad: 'kg' },
  { id: 'merma_pct', label: '% sobre producción', valor: 2.3, unidad: '%' },
  { id: 'merma_costo', label: 'Costo estimado', valor: 3860, unidad: 'S/' },
  { id: 'baldes', label: 'Baldes a pasteurizar', valor: 26, unidad: '' },
];

export const mermasApiladasPorLinea: MermaApiladaLinea[] = [
  { lineaId: 'LIN-01', lineaCodigo: 'L1', lineaNombre: 'Paletas', MP: 18, EP: 42, PT: 21, total: 81 },
  { lineaId: 'LIN-02', lineaCodigo: 'L2', lineaNombre: 'Conos', MP: 22, EP: 58, PT: 26, total: 106 },
  { lineaId: 'LIN-03', lineaCodigo: 'L3', lineaNombre: 'Vasos', MP: 16, EP: 51, PT: 19, total: 86 },
  { lineaId: 'LIN-04', lineaCodigo: 'L4', lineaNombre: 'Sándwich', MP: 14, EP: 37, PT: 24, total: 75 },
  { lineaId: 'LIN-05', lineaCodigo: 'L5', lineaNombre: 'Bombones', MP: 11, EP: 34, PT: 19, total: 64 },
];

const CAUSAS_MERMA_HEATMAP: [string, string, [number, number, number]][] = [
  ['MR-01', 'Sobrepeso', [41, 52, 34]],
  ['MR-02', 'Rotura', [28, 39, 26]],
  ['MR-03', 'Arranque', [46, 38, 29]],
  ['MR-04', 'Contaminación', [12, 41, 26]],
];

export const mermasHeatmap: HeatmapCelda[] = CAUSAS_MERMA_HEATMAP.flatMap(([codigo, nombre, valores]) =>
  (['M', 'T', 'N'] as const).map((turno, i) => ({
    fila: codigo,
    filaLabel: `${codigo} ${nombre}`,
    columna: turno,
    columnaLabel: turno === 'M' ? 'Mañana' : turno === 'T' ? 'Tarde' : 'Noche',
    valor: valores[i]!,
  }))
);

export const detallePorCausaMerma: DetalleCausaMerma[] = [
  { causaId: 'CME-MR-01', causaCodigo: 'MR-01', causaNombre: 'Sobrepeso', kg: 127, pct: redondear((127 / 412) * 100), tipoPredominante: 'PT', lineaMasAfectada: 'L2 Conos' },
  { causaId: 'CME-MR-02', causaCodigo: 'MR-02', causaNombre: 'Rotura', kg: 93, pct: redondear((93 / 412) * 100), tipoPredominante: 'PT', lineaMasAfectada: 'L4 Sándwich' },
  { causaId: 'CME-MR-03', causaCodigo: 'MR-03', causaNombre: 'Arranque', kg: 113, pct: redondear((113 / 412) * 100), tipoPredominante: 'EP', lineaMasAfectada: 'L3 Vasos' },
  { causaId: 'CME-MR-04', causaCodigo: 'MR-04', causaNombre: 'Contaminación', kg: 79, pct: redondear((79 / 412) * 100), tipoPredominante: 'MP', lineaMasAfectada: 'L1 Paletas' },
];

/* ------------------------------------------------------------------ */
/* Historial de exportaciones — spec 06.D                              */
/* ------------------------------------------------------------------ */

export const exportacionesIniciales = [
  { id: 'EXP-004', nombre: 'Órdenes y paradas · agosto 2026', datasets: ['ordenes', 'paradas'] as const, formato: 'xlsx' as const, solicitadoEn: `${fechaMenos(0)}T09:12:00`, solicitadoPor: 'Carlos Mendoza', estado: 'listo' as const, tamano: '2,4 MB', url: '/mock/exports/exp-004.xlsx' },
  { id: 'EXP-003', nombre: 'Indicadores OEE · semana 34', datasets: ['indicadores'] as const, formato: 'pdf' as const, solicitadoEn: `${fechaMenos(1)}T16:44:00`, solicitadoPor: 'Ana Ríos', estado: 'listo' as const, tamano: '860 KB', url: '/mock/exports/exp-003.pdf' },
  { id: 'EXP-002', nombre: 'Mermas por causa · agosto 2026', datasets: ['mermas'] as const, formato: 'csv' as const, solicitadoEn: `${fechaMenos(2)}T11:02:00`, solicitadoPor: 'María Torres', estado: 'listo' as const, tamano: '412 KB', url: '/mock/exports/exp-002.csv' },
  { id: 'EXP-001', nombre: 'Evidencia TRI/TCI para SPSS', datasets: ['evidencia'] as const, formato: 'csv' as const, solicitadoEn: `${fechaMenos(3)}T08:30:00`, solicitadoPor: 'Investigador Tesis', estado: 'generando' as const },
];
