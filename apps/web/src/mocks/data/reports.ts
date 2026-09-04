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
  { causaCodigo: 'PN-02', causaNombre: 'Paro por fallas', minutos: 179 },
  { causaCodigo: 'PP-01', causaNombre: 'Paro rutinario (planificado)', minutos: 134 },
  { causaCodigo: 'PN-04', causaNombre: 'Paro imprevisto', minutos: 83 },
  { causaCodigo: 'PN-03', causaNombre: 'Demoras', minutos: 50 },
  { causaCodigo: 'PS-05', causaNombre: 'Paro sin programa', minutos: 30 },
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
  { lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2', oee: 82.1, disponibilidad: 93.4, desempeno: 89.6, calidad: 98.1 },
  { lineaId: 'LIN-EXTR-3', lineaCodigo: 'EXTR-3', lineaNombre: 'Extrusora 3', oee: 81.3, disponibilidad: 92.0, desempeno: 90.1, calidad: 98.1 },
  { lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1', oee: 76.5, disponibilidad: 88.9, desempeno: 88.4, calidad: 97.3 },
  { lineaId: 'LIN-LLEN-A2', lineaCodigo: 'LLEN-A2', lineaNombre: 'Llenadora A2', oee: 71.8, disponibilidad: 84.2, desempeno: 88.1, calidad: 96.8 },
  { lineaId: 'LIN-LLEN-M1', lineaCodigo: 'LLEN-M1', lineaNombre: 'Llenadora M1', oee: 79.6, disponibilidad: 91.5, desempeno: 88.9, calidad: 97.8 },
  { lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2', oee: 78.7, disponibilidad: 90.2, desempeno: 89.4, calidad: 97.6 },
  { lineaId: 'LIN-MOLD-A2', lineaCodigo: 'MOLD-A2', lineaNombre: 'Moldeadora A2', oee: 82.9, disponibilidad: 93.1, desempeno: 90.6, calidad: 98.3 },
  { lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3', oee: 73.2, disponibilidad: 86.4, desempeno: 87.2, calidad: 97.1 },
  { lineaId: 'LIN-MOLD-A4', lineaCodigo: 'MOLD-A4', lineaNombre: 'Moldeadora A4', oee: 78.9, disponibilidad: 89.7, desempeno: 89.9, calidad: 97.9 },
];

export const comparativaTurno: ComparativaTurno[] = [
  { turno: 'D', turnoLabel: 'Día', oee: 81.4, disponibilidad: 92.3, desempeno: 90.2, calidad: 97.8, deltaOee: 1.9 },
  { turno: 'N', turnoLabel: 'Noche', oee: 77.1, disponibilidad: 88.8, desempeno: 89.2, calidad: 97.3, deltaOee: -0.5 },
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
  { causaCodigo: 'PN-02', causaNombre: 'Paro por fallas', minutos: 179 },
  { causaCodigo: 'PP-01', causaNombre: 'Paro rutinario (planificado)', minutos: 134 },
  { causaCodigo: 'PN-04', causaNombre: 'Paro imprevisto', minutos: 83 },
  { causaCodigo: 'PN-03', causaNombre: 'Demoras', minutos: 50 },
  { causaCodigo: 'PS-05', causaNombre: 'Paro sin programa', minutos: 30 },
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
  { clave: 'rutinarias', label: 'Rutinarias', valor: 164, pct: redondear((164 / TOTAL_PARETO) * 100) },
  { clave: 'imprevistas', label: 'Imprevistas', valor: 133, pct: redondear((133 / TOTAL_PARETO) * 100) },
  { clave: 'fallas', label: 'Fallas', valor: 179, pct: redondear((179 / TOTAL_PARETO) * 100) },
];

export const detallePorCausaParada: DetalleCausaParada[] = [
  { causaId: 'CPA-PN-02', causaCodigo: 'PN-02', causaNombre: 'Paro por fallas', cantidad: 14, minutos: 179, pct: redondear((179 / TOTAL_PARETO) * 100), lineaMasAfectada: 'MOLD-A3 Moldeadora A3', tendencia: [24, 28, 25, 31, 26, 23, 22] },
  { causaId: 'CPA-PP-01', causaCodigo: 'PP-01', causaNombre: 'Paro rutinario (planificado)', cantidad: 13, minutos: 134, pct: redondear((134 / TOTAL_PARETO) * 100), lineaMasAfectada: 'LLEN-M1 Llenadora M1', tendencia: [17, 20, 19, 22, 20, 18, 18] },
  { causaId: 'CPA-PN-04', causaCodigo: 'PN-04', causaNombre: 'Paro imprevisto', cantidad: 10, minutos: 83, pct: redondear((83 / TOTAL_PARETO) * 100), lineaMasAfectada: 'LLEN-A2 Llenadora A2', tendencia: [10, 13, 11, 14, 12, 12, 11] },
  { causaId: 'CPA-PN-03', causaCodigo: 'PN-03', causaNombre: 'Demoras', cantidad: 7, minutos: 50, pct: redondear((50 / TOTAL_PARETO) * 100), lineaMasAfectada: 'EXTR-3 Extrusora 3', tendencia: [6, 8, 7, 9, 7, 7, 6] },
  { causaId: 'CPA-PS-05', causaCodigo: 'PS-05', causaNombre: 'Paro sin programa', cantidad: 4, minutos: 30, pct: redondear((30 / TOTAL_PARETO) * 100), lineaMasAfectada: 'MOLD-A4 Moldeadora A4', tendencia: [4, 5, 4, 5, 4, 4, 4] },
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
  { lineaId: 'LIN-EXTR-2', lineaCodigo: 'EXTR-2', lineaNombre: 'Extrusora 2', MP: 9, EP: 24, PT: 11, total: 44 },
  { lineaId: 'LIN-EXTR-3', lineaCodigo: 'EXTR-3', lineaNombre: 'Extrusora 3', MP: 7, EP: 18, PT: 9, total: 34 },
  { lineaId: 'LIN-LLEN-A1', lineaCodigo: 'LLEN-A1', lineaNombre: 'Llenadora A1', MP: 8, EP: 22, PT: 10, total: 40 },
  { lineaId: 'LIN-LLEN-A2', lineaCodigo: 'LLEN-A2', lineaNombre: 'Llenadora A2', MP: 6, EP: 17, PT: 8, total: 31 },
  { lineaId: 'LIN-LLEN-M1', lineaCodigo: 'LLEN-M1', lineaNombre: 'Llenadora M1', MP: 10, EP: 26, PT: 12, total: 48 },
  { lineaId: 'LIN-LLEN-M2', lineaCodigo: 'LLEN-M2', lineaNombre: 'Llenadora M2', MP: 11, EP: 29, PT: 13, total: 53 },
  { lineaId: 'LIN-MOLD-A2', lineaCodigo: 'MOLD-A2', lineaNombre: 'Moldeadora A2', MP: 9, EP: 25, PT: 12, total: 46 },
  { lineaId: 'LIN-MOLD-A3', lineaCodigo: 'MOLD-A3', lineaNombre: 'Moldeadora A3', MP: 12, EP: 33, PT: 15, total: 60 },
  { lineaId: 'LIN-MOLD-A4', lineaCodigo: 'MOLD-A4', lineaNombre: 'Moldeadora A4', MP: 11, EP: 32, PT: 13, total: 56 },
];

const CAUSAS_MERMA_HEATMAP: [string, string, [number, number]][] = [
  ['MP-01', 'Merma del proceso', [78, 62]],
  ['MP-02', 'Merma por desvío del proceso', [48, 40]],
  ['MP-03', 'Merma por fallas operativas', [56, 47]],
  ['MP-04', 'Merma por fallas de mantenimiento', [30, 25]],
  ['MP-05', 'Merma por fallas externas', [14, 12]],
];

export const mermasHeatmap: HeatmapCelda[] = CAUSAS_MERMA_HEATMAP.flatMap(([codigo, nombre, valores]) =>
  (['D', 'N'] as const).map((turno, i) => ({
    fila: codigo,
    filaLabel: `${codigo} ${nombre}`,
    columna: turno,
    columnaLabel: turno === 'D' ? 'Día' : 'Noche',
    valor: valores[i]!,
  }))
);

export const detallePorCausaMerma: DetalleCausaMerma[] = [
  { causaId: 'CME-MP-01', causaCodigo: 'MP-01', causaNombre: 'Merma del proceso', kg: 140, pct: redondear((140 / 412) * 100), tipoPredominante: 'EP', lineaMasAfectada: 'MOLD-A3 Moldeadora A3' },
  { causaId: 'CME-MP-03', causaCodigo: 'MP-03', causaNombre: 'Merma por fallas operativas', kg: 103, pct: redondear((103 / 412) * 100), tipoPredominante: 'EP', lineaMasAfectada: 'MOLD-A4 Moldeadora A4' },
  { causaId: 'CME-MP-02', causaCodigo: 'MP-02', causaNombre: 'Merma por desvío del proceso', kg: 88, pct: redondear((88 / 412) * 100), tipoPredominante: 'PT', lineaMasAfectada: 'LLEN-M2 Llenadora M2' },
  { causaId: 'CME-MP-04', causaCodigo: 'MP-04', causaNombre: 'Merma por fallas de mantenimiento', kg: 55, pct: redondear((55 / 412) * 100), tipoPredominante: 'MP', lineaMasAfectada: 'EXTR-2 Extrusora 2' },
  { causaId: 'CME-MP-05', causaCodigo: 'MP-05', causaNombre: 'Merma por fallas externas', kg: 26, pct: redondear((26 / 412) * 100), tipoPredominante: 'MP', lineaMasAfectada: 'LLEN-M1 Llenadora M1' },
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
