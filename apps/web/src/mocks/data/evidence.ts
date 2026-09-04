import type {
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaTCI,
  EvidenciaTRI,
  EvidenciaTSP,
  RegistroTRI,
  VerificacionCFS,
} from '@mes/types';
import { METAS_TESIS, calcTri, estadoCfs } from '@mes/shared';
import { fechaMenos } from './seed';

/**
 * Evidencia de tesis — spec 09.
 *
 * El **postest está vacío a propósito**: TRI, TCI, TSP y EP se llenan con el uso
 * real del sistema (cada captura cronometrada, cada importación validada, cada
 * encuesta respondida, cada alerta confirmada). Aquí solo vive lo que ya está
 * medido: la línea base del pretest (Anexo 02) y la ficha de las 9
 * funcionalidades del CFS, todas sin verificar.
 *
 * Espejo de `apps/api/src/database/seeds/thesis-evidence.seed.ts`.
 */

export const PERIODOS_TESIS = {
  pretestDesde: '2026-08-24',
  pretestHasta: '2026-09-21',
  postestDesde: '2026-10-20',
  postestHasta: '2026-12-19',
} as const;

/* ------------------------------------------------------------------ */
/* TRI — Anexo 02 · solo el pretest medido a mano                      */
/* ------------------------------------------------------------------ */

/** Eventos cronometrados en la hoja de cálculo del pretest. */
const EVENTOS_TRI = [
  'Parada PP-01-10 · LLEN-A1 Llenadora A1',
  'Merma EP 3,2 kg · LLEN-A1 Llenadora A1',
  'Velocidad 131 u/min · LLEN-A1 Llenadora A1',
  'Parada PN-04-01 · LLEN-A1 Llenadora A1',
  'Parada PN-02-01 · LLEN-A1 Llenadora A1',
  'Merma PT 1,8 kg · LLEN-A1 Llenadora A1',
  'Parada PN-04-14 · LLEN-A1 Llenadora A1',
  'Inicio de orden OF-2026-0814 · LLEN-M2 Llenadora M2',
  'Parada PN-02-02 · MOLD-A3 Moldeadora A3',
  'Merma EP 2,4 kg · EXTR-2 Extrusora 2',
];

const HORAS_PRETEST = ['07:45:00', '11:12:00', '09:18:00', '09:31:00', '11:26:00', '13:02:00', '12:49:00', '06:09:00', '13:56:00', '10:40:00'];
/** Segundos cronometrados a mano: media 174 s = 2,9 min. */
const SEGUNDOS_PRETEST = [168, 186, 162, 204, 156, 180, 174, 150, 192, 168];

export const triPretest: RegistroTRI[] = SEGUNDOS_PRETEST.map((segundos, i) => ({
  id: `TRI-PR-${String(i + 1).padStart(2, '0')}`,
  n: i + 1,
  fecha: fechaMenos(30 + i),
  eventoRegistrado: EVENTOS_TRI[i]!,
  horaInicioRegistro: HORAS_PRETEST[i]!,
  tiempoMin: Math.round((segundos / 60) * 10) / 10,
  etapa: 'pretest',
  observacion: 'Registro manual en hoja de cálculo',
}));

export const META_TRI = `Reducción ≥ ${METAS_TESIS.TRI_REDUCCION_PCT} % vs pretest`;

export const evidenciaTri: EvidenciaTRI = {
  postest: [],
  pretest: triPretest,
  promedioPostest: null,
  promedioPretest: calcTri(triPretest.map((r) => r.tiempoMin)),
  reduccionPct: null,
  meta: META_TRI,
  estado: 'sin_datos',
};

/* ------------------------------------------------------------------ */
/* TCI — Anexo 03 · sin evaluaciones hasta la primera validación       */
/* ------------------------------------------------------------------ */

export const META_TCI = `≥ ${METAS_TESIS.TCI_PCT} %`;

/** Las evaluaciones nacen de `POST /evidencia/tci/validar`, nunca del seed. */
export const evidenciaTci: EvidenciaTCI = {
  registros: [],
  registrosCorrectos: 0,
  registrosTotales: 0,
  porcentaje: null,
  meta: META_TCI,
  estado: 'sin_datos',
  porTipo: {
    parada: { correctos: 0, totales: 0 },
    merma: { correctos: 0, totales: 0 },
    velocidad: { correctos: 0, totales: 0 },
  },
  fuentes: [],
};

/* ------------------------------------------------------------------ */
/* TSP — Anexo 04 · los 8 ítems del instrumento, sin respuestas        */
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

export const META_TSP = `≥ ${METAS_TESIS.TSP_PCT} % de acuerdo`;

/** Título y ayuda de la encuesta pública (`/encuesta/:token`). */
export const ENCUESTA_TITULO = 'Encuesta de satisfacción · MES Yamboly';
export const ENCUESTA_DESCRIPCION =
  'Ocho preguntas sobre tu experiencia registrando la producción con el sistema. Responde del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo). Es anónima y toma menos de 3 minutos.';

/** Sin invitaciones ni respuestas: las crea el investigador desde la vista 09.D. */
export const evidenciaTsp: EvidenciaTSP = {
  items: ITEMS_TSP.map((texto, i) => ({ n: i + 1, texto, promedio: null, pctAcuerdo: null })),
  invitaciones: [],
  respuestas: 0,
  invitados: 0,
  promedio: null,
  pctAcuerdo: null,
  meta: META_TSP,
  estado: 'sin_datos',
  enlace: '',
};

/* ------------------------------------------------------------------ */
/* CFS — Anexo 05 · 9 funcionalidades por verificar                    */
/* ------------------------------------------------------------------ */

export const verificacionesCfs: VerificacionCFS[] = [
  { id: 'CFS-1', n: 1, rf: 'RF1', funcionalidad: 'Captura de datos productivos', cumple: false, observacion: '', verificadaEn: null, ruta: '/tiempo-real' },
  { id: 'CFS-2', n: 2, rf: 'RF2', funcionalidad: 'Registro de producción', cumple: false, observacion: '', verificadaEn: null, ruta: '/ordenes' },
  { id: 'CFS-3', n: 3, rf: 'RF3', funcionalidad: 'Registro de paradas', cumple: false, observacion: '', verificadaEn: null, ruta: '/ordenes/ORD-0815' },
  { id: 'CFS-4', n: 4, rf: 'RF4', funcionalidad: 'Registro de mermas', cumple: false, observacion: '', verificadaEn: null, ruta: '/ordenes/ORD-0815' },
  { id: 'CFS-5', n: 5, rf: 'RF5', funcionalidad: 'Repositorio centralizado', cumple: false, observacion: '', verificadaEn: null, ruta: '/ordenes' },
  { id: 'CFS-6', n: 6, rf: 'RF6', funcionalidad: 'Dashboard en tiempo real', cumple: false, observacion: '', verificadaEn: null, ruta: '/tiempo-real' },
  { id: 'CFS-7', n: 7, rf: 'RF7', funcionalidad: 'Indicadores', cumple: false, observacion: '', verificadaEn: null, ruta: '/reportes' },
  { id: 'CFS-8', n: 8, rf: 'RF8', funcionalidad: 'Analítica con IA', cumple: false, observacion: '', verificadaEn: null, ruta: '/analitica' },
  { id: 'CFS-9', n: 9, rf: 'RF9', funcionalidad: 'Alertas', cumple: false, observacion: '', verificadaEn: null, ruta: '/alertas' },
];

export const META_CFS = `${METAS_TESIS.CFS_TOTAL} / ${METAS_TESIS.CFS_TOTAL} funcionalidades`;

export const evidenciaCfs: EvidenciaCFS = {
  items: verificacionesCfs,
  cumplidas: 0,
  totales: verificacionesCfs.length,
  verificadas: 0,
  porcentaje: null,
  meta: META_CFS,
  estado: estadoCfs(null),
};

/* ------------------------------------------------------------------ */
/* EP — Anexo 06 · sin predicciones contrastadas                       */
/* ------------------------------------------------------------------ */

export const META_EP = `≥ ${METAS_TESIS.EP_PCT} %`;

/**
 * El Anexo 06 se llena confirmando alertas en `/alertas`. Las alertas del seed
 * marcadas como «confirmadas» son demo operativa y no cuentan como evidencia.
 */
export const evidenciaEp: EvidenciaEP = {
  registros: [],
  prediccionesCorrectas: 0,
  prediccionesTotales: 0,
  porcentaje: null,
  meta: META_EP,
  estado: 'sin_datos',
};
