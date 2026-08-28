import type {
  EvaluacionTCI,
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaTCI,
  EvidenciaTRI,
  EncuestaTSP,
  ItemEncuesta,
  RegistroEP,
  RegistroTRI,
  VerificacionCFS,
} from '@mes/types';
import { fechaMenos, redondear } from './seed';

/** Evidencia de tesis — spec 09. Los 5 KPI cierran con los valores del Anexo. */

export const PERIODOS_TESIS = {
  pretestDesde: '2026-08-24',
  pretestHasta: '2026-09-21',
  postestDesde: '2026-10-20',
  postestHasta: '2026-12-19',
} as const;

/* ------------------------------------------------------------------ */
/* TRI — Anexo 02 (10 filas postest, 10 pretest)                       */
/* ------------------------------------------------------------------ */

const EVENTOS_TRI = [
  'Parada PL-03-02 · L2 Conos',
  'Merma EP 3,2 kg · L2 Conos',
  'Velocidad 118 u/min · L2 Conos',
  'Parada PO-06-01 · L2 Conos',
  'Parada PM-01-03 · L2 Conos',
  'Merma PT 1,8 kg · L2 Conos',
  'Parada PA-05-03 · L2 Conos',
  'Inicio de orden OF-2026-0814 · L1 Paletas',
  'Parada PM-01-04 · L4 Sándwich',
  'Merma EP 2,4 kg · L3 Vasos',
];

const HORAS_POSTEST = ['07:42:18', '11:05:07', '09:10:33', '09:24:12', '11:18:41', '12:52:09', '12:40:55', '06:02:14', '13:47:26', '10:31:48'];
const TIEMPOS_POSTEST = [1.2, 1.5, 1.3, 1.6, 1.1, 1.4, 1.5, 1.2, 1.7, 1.5];
const HORAS_PRETEST = ['07:45:00', '11:12:00', '09:18:00', '09:31:00', '11:26:00', '13:02:00', '12:49:00', '06:09:00', '13:56:00', '10:40:00'];
const TIEMPOS_PRETEST = [2.8, 3.1, 2.7, 3.4, 2.6, 3.0, 2.9, 2.5, 3.2, 2.8];

const triPostest: RegistroTRI[] = TIEMPOS_POSTEST.map((tiempoMin, i) => ({
  id: `TRI-PO-${String(i + 1).padStart(2, '0')}`,
  n: i + 1,
  fecha: fechaMenos(i < 7 ? 0 : i - 6),
  eventoRegistrado: EVENTOS_TRI[i]!,
  horaInicioRegistro: HORAS_POSTEST[i]!,
  tiempoMin,
  etapa: 'postest',
}));

const triPretest: RegistroTRI[] = TIEMPOS_PRETEST.map((tiempoMin, i) => ({
  id: `TRI-PR-${String(i + 1).padStart(2, '0')}`,
  n: i + 1,
  fecha: fechaMenos(30 + i),
  eventoRegistrado: EVENTOS_TRI[i]!,
  horaInicioRegistro: HORAS_PRETEST[i]!,
  tiempoMin,
  etapa: 'pretest',
  observacion: 'Registro manual en hoja de cálculo',
}));

const promedioPostest = redondear(TIEMPOS_POSTEST.reduce((a, b) => a + b, 0) / TIEMPOS_POSTEST.length);
const promedioPretest = redondear(TIEMPOS_PRETEST.reduce((a, b) => a + b, 0) / TIEMPOS_PRETEST.length);

export const evidenciaTri: EvidenciaTRI = {
  postest: triPostest,
  pretest: triPretest,
  promedioPostest,
  promedioPretest,
  reduccionPct: redondear(((promedioPostest - promedioPretest) / promedioPretest) * 100),
  meta: 'Reducción ≥ 40 % vs pretest',
  estado: 'cumple',
};

/* ------------------------------------------------------------------ */
/* TCI — Anexo 03 (30 evaluaciones, 28 correctas = 93,3 %)             */
/* ------------------------------------------------------------------ */

const REGISTROS_TCI = [
  'Parada 07:42 · PL-03-02 · L2',
  'Merma EP 3,2 kg · MR-03 · L2',
  'Velocidad 118 u/min · L2',
  'Parada 09:24 · PO-06-01 · L2',
  'Parada 11:18 · PM-01-03 · L2',
  'Merma PT 1,8 kg · MR-01 · L2',
  'Parada 12:40 · PA-05-03 · L2',
  'Orden OF-2026-0814 · L1',
  'Parada 13:47 · PM-01-04 · L4',
  'Merma EP 2,4 kg · MR-03 · L3',
];

const OBSERVACION_INCORRECTA = [
  'Sin acción tomada al momento del registro; se completó al día siguiente',
  'Hora de fin registrada fuera del turno; se corrigió en bitácora',
];

function generarTci(): EvaluacionTCI[] {
  const out: EvaluacionTCI[] = [];
  const turnos: EvaluacionTCI['turno'][] = ['M', 'T', 'N'];
  /** Índices (0-based) de los 2 registros que no cumplen los 4 criterios. */
  const fallos = new Set([11, 23]);
  for (let i = 0; i < 30; i += 1) {
    const falla = fallos.has(i);
    out.push({
      id: `TCI-${String(i + 1).padStart(2, '0')}`,
      n: i + 1,
      fecha: fechaMenos(Math.floor(i / 3)),
      turno: turnos[i % 3]!,
      registro: REGISTROS_TCI[i % REGISTROS_TCI.length]!,
      completo: !falla || i === 23,
      preciso: !falla,
      trazable: true,
      valido: !falla,
      observacion: falla
        ? OBSERVACION_INCORRECTA[i === 11 ? 0 : 1]!
        : 'Cumple los 4 criterios de calidad',
    });
  }
  return out;
}

const registrosTci = generarTci();
const correctosTci = registrosTci.filter((r) => r.completo && r.preciso && r.trazable && r.valido).length;

export const evidenciaTci: EvidenciaTCI = {
  registros: registrosTci,
  registrosCorrectos: correctosTci,
  registrosTotales: registrosTci.length,
  porcentaje: redondear((correctosTci / registrosTci.length) * 100),
  meta: '≥ 90 %',
  estado: 'cumple',
};

/* ------------------------------------------------------------------ */
/* TSP — Anexo 04 (8 ítems Likert, 19 respuestas, 84,2 % de acuerdo)   */
/* ------------------------------------------------------------------ */

export const ITEMS_TSP: string[] = [
  'El sistema me permite registrar la producción en menos tiempo que antes.',
  'Los formularios de registro de paradas son claros y fáciles de completar.',
  'La información de mermas que registro queda correctamente clasificada.',
  'El tablero de tiempo real me muestra el estado de mi línea sin buscar en otro lado.',
  'Los indicadores del sistema me ayudan a tomar decisiones durante el turno.',
  'Las alertas del sistema llegan con suficiente anticipación para actuar.',
  'Confío en que los datos que muestra el sistema reflejan lo que ocurre en planta.',
  'Recomendaría seguir usando el sistema en mi área de trabajo.',
];

const RESPUESTAS_TSP = 19;
const INVITADOS_TSP = 22;
const DE_ACUERDO_POR_ITEM = [17, 16, 15, 17, 16, 15, 16, 16];
const PROMEDIO_POR_ITEM = [4.4, 4.2, 4.0, 4.5, 4.2, 3.9, 4.2, 4.1];

const itemsTsp: ItemEncuesta[] = ITEMS_TSP.map((texto, i) => ({
  n: i + 1,
  texto,
  promedio: PROMEDIO_POR_ITEM[i]!,
  pctAcuerdo: redondear((DE_ACUERDO_POR_ITEM[i]! / RESPUESTAS_TSP) * 100),
}));

const totalDeAcuerdo = DE_ACUERDO_POR_ITEM.reduce((a, b) => a + b, 0);
const totalRespuestas = RESPUESTAS_TSP * ITEMS_TSP.length;

export const encuestaTsp: EncuestaTSP = {
  items: itemsTsp,
  respuestas: RESPUESTAS_TSP,
  invitados: INVITADOS_TSP,
  promedio: Math.round((PROMEDIO_POR_ITEM.reduce((a, b) => a + b, 0) / ITEMS_TSP.length) * 100) / 100,
  pctAcuerdo: redondear((totalDeAcuerdo / totalRespuestas) * 100),
  meta: '≥ 80 % de acuerdo',
  estado: 'cumple',
  enlace: '/encuesta/YMB-2026-TSP',
};

export const TOKEN_ENCUESTA = 'YMB-2026-TSP';

/* ------------------------------------------------------------------ */
/* CFS — Anexo 05 (9 funcionalidades)                                  */
/* ------------------------------------------------------------------ */

export const verificacionesCfs: VerificacionCFS[] = [
  { id: 'CFS-1', n: 1, rf: 'RF1', funcionalidad: 'Captura de datos productivos', cumple: true, observacion: 'Registro en 3 toques con cronómetro TRI en cada modal', ruta: '/tiempo-real' },
  { id: 'CFS-2', n: 2, rf: 'RF2', funcionalidad: 'Registro de producción', cumple: true, observacion: 'Inicio y cierre de orden con conteo de codificadora', ruta: '/ordenes' },
  { id: 'CFS-3', n: 3, rf: 'RF3', funcionalidad: 'Registro de paradas', cumple: true, observacion: 'Árbol de causas PM-01…PS-07 con acción tomada obligatoria', ruta: '/ordenes/ORD-0815' },
  { id: 'CFS-4', n: 4, rf: 'RF4', funcionalidad: 'Registro de mermas', cumple: true, observacion: 'Tipos MP/EP/PT y causas MR-01…MR-04 con código de balde', ruta: '/ordenes/ORD-0815' },
  { id: 'CFS-5', n: 5, rf: 'RF5', funcionalidad: 'Repositorio centralizado', cumple: true, observacion: 'Órdenes con filtros, búsqueda, exportación y bitácora', ruta: '/ordenes' },
  { id: 'CFS-6', n: 6, rf: 'RF6', funcionalidad: 'Dashboard en tiempo real', cumple: true, observacion: '6 líneas con estado, avance y Modo TV', ruta: '/tiempo-real' },
  { id: 'CFS-7', n: 7, rf: 'RF7', funcionalidad: 'Indicadores', cumple: true, observacion: 'OEE por línea, turno y periodo con comparativas', ruta: '/reportes' },
  { id: 'CFS-8', n: 8, rf: 'RF8', funcionalidad: 'Analítica con IA', cumple: true, observacion: 'Modelo v3.2 CRISP-DM con patrones y predicciones', ruta: '/analitica' },
  { id: 'CFS-9', n: 9, rf: 'RF9', funcionalidad: 'Alertas', cumple: true, observacion: 'Bandeja con umbrales configurables y confirmación de evento real', ruta: '/alertas' },
];

export const evidenciaCfs: EvidenciaCFS = {
  items: verificacionesCfs,
  cumplidas: verificacionesCfs.filter((v) => v.cumple).length,
  totales: verificacionesCfs.length,
  porcentaje: 100,
  meta: '9 / 9 funcionalidades',
  estado: 'cumple',
};

/* ------------------------------------------------------------------ */
/* EP — Anexo 06 (137 / 164 = 83,5 %)                                  */
/* ------------------------------------------------------------------ */

export const EP_CORRECTAS_BASE = 137;
export const EP_TOTALES_BASE = 164;

const TIPOS_EP = [
  'Parada prevista · L2 Conos',
  'Merma prevista · L3 Vasos',
  'Velocidad baja · L1 Paletas',
  'OEE bajo umbral · L4 Sándwich',
  'Parada prevista · L4 Sándwich',
  'Parada prevista · L5 Bombones',
];

function generarEp(): RegistroEP[] {
  const out: RegistroEP[] = [];
  for (let i = 0; i < 18; i += 1) {
    const acierto = i % 6 !== 5;
    out.push({
      id: `EP-${String(i + 1).padStart(2, '0')}`,
      n: i + 1,
      fecha: fechaMenos(Math.floor(i / 2)),
      tipoPrediccion: TIPOS_EP[i % TIPOS_EP.length]!,
      eventoReal: acierto
        ? 'El evento ocurrió dentro de la ventana prevista'
        : 'No se observó el evento en la ventana',
      acierto,
      observacion: acierto ? 'Confirmado por el supervisor de turno' : 'Se aplicó acción preventiva antes de la ventana',
      alertaId: i < 6 ? `ALE-${String(i + 18).padStart(3, '0')}` : undefined,
    });
  }
  return out;
}

export const evidenciaEp: EvidenciaEP = {
  registros: generarEp(),
  prediccionesCorrectas: EP_CORRECTAS_BASE,
  prediccionesTotales: EP_TOTALES_BASE,
  porcentaje: redondear((EP_CORRECTAS_BASE / EP_TOTALES_BASE) * 100),
  meta: '≥ 80 %',
  estado: 'cumple',
};
