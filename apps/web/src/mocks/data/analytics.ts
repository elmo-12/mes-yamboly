import type {
  AnaliticaResumen,
  EstadoDatos,
  HeatmapCelda,
  Modelo,
  Patrones,
  Predicciones,
} from '@mes/types';
import { fechaMenos, redondear, rng } from './seed';

/** Analítica IA — spec 08 (modelo v3.2, 2 140 eventos, EP 83,5 %). */

export const analiticaResumen: AnaliticaResumen = {
  modelo: {
    version: 'v3.2',
    entrenadoEn: '2026-08-24',
    eventos: 2140,
    algoritmo: 'Gradient Boosting (scikit-learn)',
    activo: true,
  },
  kpis: { ep: 83.5, precision: 81, recall: 77, alertas30d: 142 },
  insights: [
    {
      id: 'INS-01',
      tono: 'warning',
      texto: 'L2 Conos concentra 34 % de paradas mecánicas en turno Tarde',
      soporte: '48 de 142 eventos PM-01 de los últimos 30 días',
    },
    {
      id: 'INS-02',
      tono: 'info',
      texto: 'Cambios PC-04 después de las 12:00 duran 40 % más',
      soporte: 'Media 42 min frente a 30 min del estándar',
    },
    {
      id: 'INS-03',
      tono: 'warning',
      texto: 'Merma EP sube 1,8 pp en arranques con Sabor Lúcuma',
      soporte: '19 arranques analizados en L3 Vasos',
    },
  ],
  riesgoPorLinea: [
    { lineaId: 'LIN-02', lineaCodigo: 'L2', lineaNombre: 'Conos', riesgo: 78, turnoObjetivo: 'T', causaProbable: 'PM-01 Falla mecánica · Envolvedora L2' },
    { lineaId: 'LIN-04', lineaCodigo: 'L4', lineaNombre: 'Sándwich', riesgo: 71, turnoObjetivo: 'T', causaProbable: 'PM-01 Desalineación de moldes' },
    { lineaId: 'LIN-03', lineaCodigo: 'L3', lineaNombre: 'Vasos', riesgo: 64, turnoObjetivo: 'T', causaProbable: 'PE-02 Falla de variador' },
    { lineaId: 'LIN-01', lineaCodigo: 'L1', lineaNombre: 'Paletas', riesgo: 46, turnoObjetivo: 'T', causaProbable: 'PO-06 Ajuste de temperatura' },
    { lineaId: 'LIN-05', lineaCodigo: 'L5', lineaNombre: 'Bombones', riesgo: 38, turnoObjetivo: 'T', causaProbable: 'PA-05 Falta de cobertura' },
  ],
  prediccionesActivas: [
    { id: 'ALE-001', lineaCodigo: 'L2', tipo: 'Parada prevista', prediccion: 'Parada PM-01 en L2 en 40 min', probabilidad: 78, ventana: '14:40–15:20', estado: 'Activa' },
    { id: 'ALE-002', lineaCodigo: 'L4', tipo: 'Parada prevista', prediccion: 'Parada PM-01 en curso · riesgo de superar 30 min', probabilidad: 91, ventana: '13:47–14:30', estado: 'Activa' },
    { id: 'ALE-004', lineaCodigo: 'L3', tipo: 'Merma prevista', prediccion: 'Merma EP sobre 2,5 % en L3', probabilidad: 74, ventana: '14:00–18:00', estado: 'Activa' },
    { id: 'ALE-005', lineaCodigo: 'L4', tipo: 'OEE bajo umbral', prediccion: 'OEE del turno bajo 75 % en L4', probabilidad: 83, ventana: '14:00–22:00', estado: 'Activa' },
    { id: 'ALE-006', lineaCodigo: 'L5', tipo: 'Parada prevista', prediccion: 'Parada PA-05 por falta de cobertura', probabilidad: 70, ventana: '15:30–16:30', estado: 'Activa' },
  ],
};

/* ------------------------------------------------------------------ */
/* Patrones — heatmap causa × turno (minutos)                          */
/* ------------------------------------------------------------------ */

const CAUSAS_HEATMAP = [
  { codigo: 'PM-01', nombre: 'Falla mecánica' },
  { codigo: 'PE-02', nombre: 'Falla eléctrica' },
  { codigo: 'PL-03', nombre: 'Limpieza CIP' },
  { codigo: 'PC-04', nombre: 'Cambio de producto' },
  { codigo: 'PA-05', nombre: 'Falta de insumo' },
  { codigo: 'PO-06', nombre: 'Ajuste operativo' },
  { codigo: 'PS-07', nombre: 'Sin personal' },
];

const TURNOS_HEATMAP = [
  { codigo: 'M', label: 'Mañana' },
  { codigo: 'T', label: 'Tarde' },
  { codigo: 'N', label: 'Noche' },
];

/** Minutos por causa × turno (fijos, suman los totales del Pareto semanal). */
const MINUTOS_HEATMAP: Record<string, [number, number, number]> = {
  'PM-01': [38, 72, 32],
  'PE-02': [11, 15, 11],
  'PL-03': [42, 31, 23],
  'PC-04': [26, 41, 21],
  'PA-05': [17, 21, 13],
  'PO-06': [14, 19, 11],
  'PS-07': [4, 6, 8],
};

function heatmapCausaTurno(): HeatmapCelda[] {
  const celdas: HeatmapCelda[] = [];
  for (const causa of CAUSAS_HEATMAP) {
    const valores = MINUTOS_HEATMAP[causa.codigo]!;
    TURNOS_HEATMAP.forEach((turno, i) => {
      celdas.push({
        fila: causa.codigo,
        filaLabel: `${causa.codigo} ${causa.nombre}`,
        columna: turno.codigo,
        columnaLabel: turno.label,
        valor: valores[i]!,
      });
    });
  }
  return celdas;
}

export const patrones: Patrones = {
  heatmap: heatmapCausaTurno(),
  recurrencias: [
    { id: 'REC-01', patron: 'PM-01 en Envolvedora L2 tras cambio de producto', frecuencia: 9, impactoMin: 118, lineas: ['L2'], confianza: 88 },
    { id: 'REC-02', patron: 'PC-04 después de las 12:00 excede el tiempo estándar', frecuencia: 12, impactoMin: 96, lineas: ['L1', 'L2', 'L4'], confianza: 84 },
    { id: 'REC-03', patron: 'Merma EP alta en arranque con sabor Lúcuma', frecuencia: 7, impactoMin: 0, lineas: ['L3'], confianza: 81 },
    { id: 'REC-04', patron: 'PE-02 en Selladora L3 en turno Tarde', frecuencia: 5, impactoMin: 74, lineas: ['L3'], confianza: 76 },
    { id: 'REC-05', patron: 'PS-07 en turno Noche por refrigerio no cubierto', frecuencia: 4, impactoMin: 48, lineas: ['L4', 'L5'], confianza: 72 },
    { id: 'REC-06', patron: 'PA-05 falta de bobina al final del turno Mañana', frecuencia: 6, impactoMin: 62, lineas: ['L2', 'L5'], confianza: 69 },
  ],
};

/* ------------------------------------------------------------------ */
/* Predicciones — predicho vs real, 30 días                            */
/* ------------------------------------------------------------------ */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaFecha(isoFecha: string): string {
  const d = new Date(`${isoFecha}T00:00:00`);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function serie(): Predicciones['serie'] {
  const r = rng(606);
  const out: Predicciones['serie'] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const fecha = fechaMenos(i);
    const predicho = r.int(4, 11);
    const real = Math.max(2, predicho + r.int(-2, 2));
    out.push({ fecha, etiqueta: etiquetaFecha(fecha), predicho, real });
  }
  return out;
}

function historico(): Predicciones['historico'] {
  const r = rng(707);
  const lineasRef = ['L1', 'L2', 'L3', 'L4', 'L5'];
  const tipos = ['Parada prevista', 'Merma prevista', 'Velocidad baja', 'OEE bajo umbral'];
  const out: Predicciones['historico'] = [];
  for (let i = 0; i < 24; i += 1) {
    const linea = lineasRef[i % lineasRef.length]!;
    const tipo = tipos[i % tipos.length]!;
    const acierto = i % 6 !== 5;
    out.push({
      id: `PRD-HIS-${String(i + 1).padStart(2, '0')}`,
      fecha: fechaMenos(Math.floor(i / 2) + 1),
      lineaCodigo: linea,
      tipo,
      prediccion: `${tipo} en ${linea}`,
      probabilidad: r.int(70, 94),
      eventoReal: acierto ? 'Evento ocurrido dentro de la ventana' : 'Sin evento en la ventana',
      acierto,
    });
  }
  return out;
}

export const predicciones: Predicciones = { serie: serie(), historico: historico() };

/* ------------------------------------------------------------------ */
/* Modelo CRISP-DM                                                     */
/* ------------------------------------------------------------------ */

export const modelo: Modelo = {
  fasesCrispDm: [
    { id: 'comprension_negocio', orden: 1, nombre: 'Comprensión del negocio', estado: 'completada', descripcion: 'Objetivo: anticipar paradas y mermas para reducir el tiempo perdido en las 5 líneas.', metricas: [{ label: 'Objetivos', valor: '3' }, { label: 'RF cubiertos', valor: 'RF8, RF9' }] },
    { id: 'comprension_datos', orden: 2, nombre: 'Comprensión de los datos', estado: 'completada', descripcion: 'Órdenes, paradas, mermas y velocidades registradas desde el MES.', metricas: [{ label: 'Registros', valor: '2 140' }, { label: 'Fuentes', valor: '4' }] },
    { id: 'preparacion', orden: 3, nombre: 'Preparación de los datos', estado: 'completada', descripcion: 'Limpieza, codificación de causas y construcción de ventanas temporales.', metricas: [{ label: 'Features', valor: '14' }, { label: 'Nulos tratados', valor: '2,1 %' }] },
    { id: 'modelado', orden: 4, nombre: 'Modelado', estado: 'completada', descripcion: 'Gradient Boosting con validación cruzada estratificada de 5 pliegues.', metricas: [{ label: 'Algoritmo', valor: 'Gradient Boosting' }, { label: 'Pliegues', valor: '5' }] },
    { id: 'evaluacion', orden: 5, nombre: 'Evaluación', estado: 'completada', descripcion: 'Métricas sobre el conjunto de prueba y contraste con el registro real (Anexo 06).', metricas: [{ label: 'AUC', valor: '0,86' }, { label: 'F1', valor: '0,79' }] },
    { id: 'despliegue', orden: 6, nombre: 'Despliegue', estado: 'en_curso', descripcion: 'Servicio de inferencia en Python conectado al motor de alertas y a n8n.', metricas: [{ label: 'Versión activa', valor: 'v3.2' }, { label: 'Alertas 30 d', valor: '142' }] },
  ],
  metricas: { registros: 2140, features: 14, algoritmo: 'Gradient Boosting (scikit-learn)', auc: 0.86, f1: 0.79 },
  versiones: [
    { version: 'v3.2', entrenadoEn: '2026-08-24', eventos: 2140, auc: 0.86, f1: 0.79, estado: 'vigente' },
    { version: 'v3.1', entrenadoEn: '2026-07-27', eventos: 1880, auc: 0.83, f1: 0.75, estado: 'archivada' },
    { version: 'v3.0', entrenadoEn: '2026-06-29', eventos: 1610, auc: 0.79, f1: 0.71, estado: 'archivada' },
  ],
  variablesEntrada: [
    { id: 'VAR-01', nombre: 'Línea', importancia: 92 },
    { id: 'VAR-02', nombre: 'Turno', importancia: 84 },
    { id: 'VAR-03', nombre: 'Producto', importancia: 71 },
    { id: 'VAR-04', nombre: 'Máquina', importancia: 88 },
    { id: 'VAR-05', nombre: 'Causa', importancia: 79 },
    { id: 'VAR-06', nombre: 'Tiempo de operación', importancia: 66 },
    { id: 'VAR-07', nombre: 'Velocidad', importancia: 74 },
    { id: 'VAR-08', nombre: 'Eventos históricos 7 d', importancia: 81 },
    { id: 'VAR-09', nombre: 'Eventos históricos 30 d', importancia: 77 },
  ],
};

/**
 * Estado por defecto: el modelo v3.2 ya está entrenado con 2 140 eventos, así
 * que hay datos suficientes (coherente con `analiticaResumen`).
 */
export const estadoDatos: EstadoDatos = {
  suficiente: true,
  eventos: 2140,
  requeridos: 2000,
  progresoPct: 100,
  estimacion: 'Volumen suficiente · el modelo se reentrena cada mes',
};

/**
 * Variante «fase de acumulación» (spec 08.E · Figma 2156:4745). El handler la
 * devuelve con `?estado=insuficiente`, que es como la vista `/analitica`
 * muestra el estado E sin falsear los datos en el componente.
 */
export const estadoDatosInsuficiente: EstadoDatos = {
  suficiente: false,
  eventos: 1250,
  requeridos: 2000,
  progresoPct: redondear((1250 / 2000) * 100),
  estimacion: 'Con el ritmo actual (62 eventos/semana) el modelo podrá entrenarse el 12/09/2026',
};
