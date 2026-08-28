import { http, HttpResponse } from 'msw';
import type { EvidenciaResumen, KpiTesis, RegistroTRI } from '@mes/types';
import { estadoCfs, estadoEp, estadoTci, estadoTri, estadoTsp } from '@mes/shared';
import {
  ITEMS_TSP,
  PERIODOS_TESIS,
  TOKEN_ENCUESTA,
  encuestaTsp,
  evidenciaCfs,
  evidenciaEp,
  evidenciaTci,
  evidenciaTri,
} from '../data';
import {
  cfsActual,
  epActual,
  getStore,
  nextId,
  tciActual,
  triActual,
  triPretestPromedio,
  tspActual,
} from '../store';
import { API, ahoraIso, errores, preludio } from './_utils';

function kpisTesis(): KpiTesis[] {
  const tri = triActual();
  const pretest = triPretestPromedio();
  const reduccion = Math.round(((tri - pretest) / pretest) * 1000) / 10;
  const tci = tciActual();
  const tsp = tspActual();
  const cfs = cfsActual();
  const ep = epActual();

  return [
    {
      id: 'TRI',
      nombre: 'Tiempo de registro de información',
      formula: 'TRI = ΣTR / n',
      valor: tri,
      unidad: 'min',
      meta: 'Reducción ≥ 40 % vs pretest',
      metaValor: 40,
      estado: estadoTri(reduccion),
      anexo: 'Anexo 02',
      detalle: `${reduccion} % vs pretest (${pretest} min)`,
    },
    {
      id: 'TCI',
      nombre: 'Tasa de calidad de la información',
      formula: 'TCI = RC / RT × 100',
      valor: tci,
      unidad: '%',
      meta: '≥ 90 %',
      metaValor: 90,
      estado: estadoTci(tci),
      anexo: 'Anexo 03',
      detalle: `${evidenciaTci.registrosCorrectos} de ${evidenciaTci.registrosTotales} registros correctos`,
    },
    {
      id: 'TSP',
      nombre: 'Tasa de satisfacción del personal',
      formula: 'TSP = PO / PT × 100',
      valor: tsp.pctAcuerdo,
      unidad: '%',
      meta: '≥ 80 % de acuerdo',
      metaValor: 80,
      estado: estadoTsp(tsp.pctAcuerdo),
      anexo: 'Anexo 04',
      detalle: `${tsp.respuestas} respuestas · promedio ${tsp.promedio} / 5`,
    },
    {
      id: 'CFS',
      nombre: 'Cumplimiento funcional del sistema',
      formula: 'CFS = FV / FT × 100',
      valor: cfs.porcentaje,
      unidad: '%',
      meta: '9 / 9 funcionalidades',
      metaValor: 100,
      estado: estadoCfs(cfs.porcentaje),
      anexo: 'Anexo 05',
      detalle: `${cfs.cumplidas} de ${cfs.totales} funcionalidades verificadas`,
    },
    {
      id: 'EP',
      nombre: 'Exactitud de las predicciones',
      formula: 'EP = PCC / PTG × 100',
      valor: ep,
      unidad: '%',
      meta: '≥ 80 %',
      metaValor: 80,
      estado: estadoEp(ep),
      anexo: 'Anexo 06',
      detalle: `${getStore().ep.correctas} de ${getStore().ep.totales} predicciones correctas`,
    },
  ];
}

export const evidenceHandlers = [
  http.get(`${API}/evidencia/resumen`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const data: EvidenciaResumen = {
      ...PERIODOS_TESIS,
      kpis: kpisTesis(),
      comparativaTri: [
        { etapa: 'Pretest', minutos: triPretestPromedio() },
        { etapa: 'Postest', minutos: triActual() },
      ],
    };
    return HttpResponse.json(data);
  }),

  http.get(`${API}/evidencia/tri`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const promedioPostest = triActual();
    const promedioPretest = triPretestPromedio();
    const reduccionPct = Math.round(((promedioPostest - promedioPretest) / promedioPretest) * 1000) / 10;
    return HttpResponse.json({
      postest: store.triPostest,
      pretest: store.triPretest,
      promedioPostest,
      promedioPretest,
      reduccionPct,
      meta: evidenciaTri.meta,
      estado: estadoTri(reduccionPct),
    });
  }),

  http.post(`${API}/evidencia/tri/pretest`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as { registros?: Partial<RegistroTRI>[] };
    const registros = body.registros ?? [];
    if (registros.length === 0) {
      return errores.validacion({ registros: 'Carga al menos un registro del pretest' });
    }
    for (const r of registros) {
      store.triPretest.push({
        id: nextId('TRI-PR'),
        n: store.triPretest.length + 1,
        fecha: String(r.fecha ?? ahoraIso().slice(0, 10)),
        eventoRegistrado: String(r.eventoRegistrado ?? 'Registro manual'),
        horaInicioRegistro: String(r.horaInicioRegistro ?? '00:00:00'),
        tiempoMin: Number(r.tiempoMin ?? 0),
        etapa: 'pretest',
        observacion: 'Cargado desde hoja de cálculo',
      });
    }
    return HttpResponse.json({ data: store.triPretest, promedioPretest: triPretestPromedio() }, { status: 201 });
  }),

  http.get(`${API}/evidencia/tci`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({ ...evidenciaTci, porcentaje: tciActual(), estado: estadoTci(tciActual()) });
  }),

  http.get(`${API}/evidencia/tsp`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const actual = tspActual();
    const items = ITEMS_TSP.map((texto, i) => {
      const valores = store.respuestasTsp.map((f) => f[i] ?? 0);
      const deAcuerdo = valores.filter((v) => v >= 4).length;
      const suma = valores.reduce((a, b) => a + b, 0);
      return {
        n: i + 1,
        texto,
        promedio: Math.round((suma / valores.length) * 100) / 100,
        pctAcuerdo: Math.round((deAcuerdo / valores.length) * 1000) / 10,
      };
    });
    return HttpResponse.json({
      ...encuestaTsp,
      items,
      respuestas: actual.respuestas,
      promedio: actual.promedio,
      pctAcuerdo: actual.pctAcuerdo,
      estado: estadoTsp(actual.pctAcuerdo),
    });
  }),

  http.get(`${API}/evidencia/cfs`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const cfs = cfsActual();
    return HttpResponse.json({
      ...evidenciaCfs,
      items: store.verificacionesCfs,
      cumplidas: cfs.cumplidas,
      totales: cfs.totales,
      porcentaje: cfs.porcentaje,
      estado: estadoCfs(cfs.porcentaje),
    });
  }),

  http.patch(`${API}/evidencia/cfs/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const item = store.verificacionesCfs.find((v) => v.id === params.id);
    if (!item) return errores.noEncontrado('Funcionalidad');
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.cumple === 'boolean') item.cumple = body.cumple;
    if (typeof body.observacion === 'string') item.observacion = body.observacion;
    return HttpResponse.json({ item, resumen: cfsActual() });
  }),

  http.get(`${API}/evidencia/ep`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const porcentaje = epActual();
    return HttpResponse.json({
      ...evidenciaEp,
      prediccionesCorrectas: store.ep.correctas,
      prediccionesTotales: store.ep.totales,
      porcentaje,
      estado: estadoEp(porcentaje),
    });
  }),

  http.post(`${API}/evidencia/exportar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: nextId('EXPEV'),
        estado: 'generando',
        formato: body.formato ?? 'xlsx',
        destino: body.destino ?? 'spss',
        solicitadoEn: ahoraIso(),
      },
      { status: 202 }
    );
  }),

  /* Encuesta pública (sin sesión) ---------------------------------- */
  http.get(`${API}/encuesta/:token`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    if (params.token !== TOKEN_ENCUESTA) return errores.noEncontrado('Encuesta');
    return HttpResponse.json({
      token: TOKEN_ENCUESTA,
      titulo: 'Encuesta de satisfacción · MES Yamboly',
      descripcion:
        'Responde del 1 (totalmente en desacuerdo) al 5 (totalmente de acuerdo). Tus respuestas son anónimas.',
      items: ITEMS_TSP.map((texto, i) => ({ n: i + 1, texto })),
      respondida: false,
    });
  }),

  http.post(`${API}/encuesta/:token`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    if (params.token !== TOKEN_ENCUESTA) return errores.noEncontrado('Encuesta');
    const body = (await request.json()) as { respuestas?: number[] };
    const respuestas = body.respuestas ?? [];
    if (respuestas.length !== ITEMS_TSP.length || respuestas.some((r) => r < 1 || r > 5)) {
      return errores.validacion({ respuestas: 'Responde los 8 ítems con valores de 1 a 5' });
    }
    getStore().respuestasTsp.push(respuestas);
    const actual = tspActual();
    return HttpResponse.json(
      { recibido: true, respuestas: actual.respuestas, pctAcuerdo: actual.pctAcuerdo },
      { status: 201 }
    );
  }),
];
