import { http, HttpResponse } from 'msw';
import type {
  EncuestaPublica,
  EvidenciaCFS,
  EvidenciaEP,
  EvidenciaResumen,
  EvidenciaTRI,
  EvidenciaTSP,
  InvitacionTSP,
  ItemEncuesta,
  KpiTesis,
  RegistroTRI,
  TipoFuenteExterna,
  TipoRegistroTci,
} from '@mes/types';
import { TIPOS_FUENTE_EXTERNA, TIPOS_REGISTRO_TCI } from '@mes/types';
import {
  METAS_TESIS,
  calcCfs,
  calcEpOpcional,
  calcTri,
  calcTriReduccion,
  calcTsp,
  estadoCfs,
  estadoEp,
  estadoTri,
  estadoTsp,
  formatNumber,
} from '@mes/shared';
import {
  ENCUESTA_DESCRIPCION,
  ENCUESTA_TITULO,
  ITEMS_TSP,
  PERIODOS_TESIS,
} from '../data';
import {
  cfsActual,
  epContadores,
  getStore,
  nextId,
  triActual,
  triPretestPromedio,
} from '../store';
import {
  ArchivoSinFilasError,
  archivoPlantilla,
  MAX_BYTES_TABLA,
  extensionAceptada,
  generarPlantilla,
  historialImportaciones,
  importarFuente,
  resumenFuentes,
} from '../evidencia-fuentes';
import {
  aEvaluacion,
  aplicarOverrideManual,
  resumenTci,
  validarTci,
} from '../evidencia-validacion';
import { API, ahoraIso, errores, hoyIso, listaQuery, numeroQuery, paginar, preludio } from './_utils';
import { usuarioDesdeToken } from './auth';

/* ------------------------------------------------------------------ */
/* Derivaciones de cada instrumento                                    */
/* ------------------------------------------------------------------ */

/** Origen público de la web, base de los enlaces de la encuesta. */
function baseWeb(): string {
  return typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
}

function evidenciaTri(): EvidenciaTRI {
  const store = getStore();
  const promedioPostest = triActual();
  const promedioPretest = triPretestPromedio();
  return {
    postest: store.triPostest,
    pretest: store.triPretest,
    promedioPostest,
    promedioPretest,
    reduccionPct: calcTriReduccion(promedioPretest, promedioPostest),
    meta: `Reducción ≥ ${METAS_TESIS.TRI_REDUCCION_PCT} % vs pretest`,
    estado: estadoTri(calcTriReduccion(promedioPretest, promedioPostest)),
  };
}

function aInvitacion(s: InvitacionTSP): InvitacionTSP {
  return {
    token: s.token,
    invitado: s.invitado,
    ...(s.rol ? { rol: s.rol } : {}),
    url: `${baseWeb()}/encuesta/${s.token}`,
    respondida: s.respondida,
    ...(s.respondidaEn ? { respondidaEn: s.respondidaEn } : {}),
    creadaEn: s.creadaEn || '',
  };
}

function evidenciaTsp(): EvidenciaTSP {
  const store = getStore();
  const matriz = store.respuestasTsp.map((f) => f.respuestas);

  const items: ItemEncuesta[] = ITEMS_TSP.map((texto, j) => {
    const columna = matriz.map((fila) => fila[j] ?? 0).filter((v) => v > 0);
    const deAcuerdo = columna.filter((v) => v >= 4).length;
    const suma = columna.reduce((a, b) => a + b, 0);
    return {
      n: j + 1,
      texto,
      promedio: columna.length ? Math.round((suma / columna.length) * 100) / 100 : null,
      pctAcuerdo: columna.length ? Math.round((deAcuerdo / columna.length) * 1000) / 10 : null,
    };
  });

  let deAcuerdo = 0;
  let total = 0;
  let suma = 0;
  for (const fila of matriz) {
    for (const valor of fila) {
      total += 1;
      suma += valor;
      if (valor >= 4) deAcuerdo += 1;
    }
  }
  const pctAcuerdo = calcTsp(deAcuerdo, total);

  const invitaciones = store.invitacionesTsp
    .map(aInvitacion)
    .sort((a, b) => a.creadaEn.localeCompare(b.creadaEn) || a.token.localeCompare(b.token));

  return {
    items,
    invitaciones,
    respuestas: matriz.length,
    invitados: store.invitacionesTsp.length,
    promedio: total ? Math.round((suma / total) * 100) / 100 : null,
    pctAcuerdo,
    meta: `≥ ${METAS_TESIS.TSP_PCT} % de acuerdo`,
    estado: estadoTsp(pctAcuerdo),
    enlace: invitaciones.length ? invitaciones[invitaciones.length - 1]!.url : '',
  };
}

function evidenciaCfs(): EvidenciaCFS {
  const items = getStore().verificacionesCfs;
  const { cumplidas } = cfsActual();
  const totales = items.length || METAS_TESIS.CFS_TOTAL;
  /* El instrumento fija FT = 9; sólo si la lista creciera se recalcula a mano. */
  const porcentaje =
    totales === METAS_TESIS.CFS_TOTAL
      ? calcCfs(cumplidas)
      : Math.round((cumplidas / totales) * 1000) / 10;
  return {
    items,
    cumplidas,
    totales: items.length,
    porcentaje,
    meta: `${METAS_TESIS.CFS_TOTAL} / ${METAS_TESIS.CFS_TOTAL} funcionalidades`,
    estado: estadoCfs(porcentaje),
  };
}

function evidenciaEp(): EvidenciaEP {
  const registros = [...getStore().registrosEp].sort((a, b) => a.n - b.n);
  const { correctas, totales } = epContadores();
  const porcentaje = calcEpOpcional(correctas, totales);
  return {
    registros,
    prediccionesCorrectas: correctas,
    prediccionesTotales: totales,
    porcentaje,
    meta: `≥ ${METAS_TESIS.EP_PCT} %`,
    estado: estadoEp(porcentaje),
  };
}

function kpisTesis(): KpiTesis[] {
  const tri = evidenciaTri();
  const tci = resumenTci();
  const tsp = evidenciaTsp();
  const cfs = evidenciaCfs();
  const ep = evidenciaEp();

  return [
    {
      id: 'TRI',
      nombre: 'Tiempo de registro de información',
      formula: 'ΣTR / n',
      valor: tri.promedioPostest,
      unidad: 'min',
      meta: `Reducción ≥ ${METAS_TESIS.TRI_REDUCCION_PCT} % vs pretest`,
      metaValor: METAS_TESIS.TRI_REDUCCION_PCT,
      estado: tri.estado,
      anexo: 'Anexo 02',
      detalle:
        tri.promedioPostest === null || tri.reduccionPct === null
          ? `Se calcula con cada captura real del sistema; el pretest está en ${formatNumber(tri.promedioPretest, 1)} min`
          : `${formatNumber(tri.promedioPostest, 1)} min frente a ${formatNumber(tri.promedioPretest, 1)} min del pretest (${formatNumber(tri.reduccionPct, 1)} %)`,
    },
    {
      id: 'TCI',
      nombre: 'Tasa de calidad de la información',
      formula: 'RC / RT × 100',
      valor: tci.porcentaje,
      unidad: '%',
      meta: `≥ ${METAS_TESIS.TCI_PCT} %`,
      metaValor: METAS_TESIS.TCI_PCT,
      estado: tci.estado,
      anexo: 'Anexo 03',
      detalle:
        tci.registrosTotales === 0
          ? 'Se calcula al validar las capturas contra las fuentes externas importadas (sensores, solicitudes y SAP)'
          : `${tci.registrosCorrectos} de ${tci.registrosTotales} registros cumplen todos sus criterios`,
    },
    {
      id: 'TSP',
      nombre: 'Tasa de satisfacción del personal',
      formula: 'PO / PT × 100',
      valor: tsp.pctAcuerdo,
      unidad: '%',
      meta: `≥ ${METAS_TESIS.TSP_PCT} % de acuerdo`,
      metaValor: METAS_TESIS.TSP_PCT,
      estado: tsp.estado,
      anexo: 'Anexo 04',
      detalle:
        tsp.respuestas > 0
          ? `${tsp.respuestas} de ${tsp.invitados} encuestados · promedio ${formatNumber(tsp.promedio ?? 0, 1)}`
          : tsp.invitados === 0
            ? 'Se calcula con las respuestas de la encuesta; todavía no se ha emitido ninguna invitación'
            : `Se calcula con las respuestas de la encuesta; ${tsp.invitados === 1 ? '1 invitación emitida' : `${tsp.invitados} invitaciones emitidas`} sin responder`,
    },
    {
      id: 'CFS',
      nombre: 'Cumplimiento funcional del sistema',
      formula: 'FV / FT × 100',
      valor: cfs.porcentaje,
      unidad: '%',
      meta: `${METAS_TESIS.CFS_TOTAL} / ${METAS_TESIS.CFS_TOTAL} funcionalidades`,
      metaValor: 100,
      estado: cfs.estado,
      anexo: 'Anexo 05',
      detalle: `${cfs.cumplidas} de ${cfs.totales} funcionalidades verificadas`,
    },
    {
      id: 'EP',
      nombre: 'Exactitud de las predicciones',
      formula: 'PCC / PTG × 100',
      valor: ep.porcentaje,
      unidad: '%',
      meta: `≥ ${METAS_TESIS.EP_PCT} %`,
      metaValor: METAS_TESIS.EP_PCT,
      estado: ep.estado,
      anexo: 'Anexo 06',
      detalle:
        ep.prediccionesTotales === 0
          ? 'Se calcula al confirmar el evento real de cada alerta en la bandeja de Alertas'
          : `${ep.prediccionesCorrectas} de ${ep.prediccionesTotales} predicciones confirmadas`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Utilidades de los handlers                                          */
/* ------------------------------------------------------------------ */

/** Valida el `:tipo` de la ruta contra las 3 fuentes conocidas. */
function tipoFuente(tipo: string): TipoFuenteExterna | null {
  return TIPOS_FUENTE_EXTERNA.find((t) => t === tipo) ?? null;
}

/** `mapeo` llega como texto JSON en el multipart; un JSON inválido es 422. */
function parsearMapeo(bruto: string | null): Record<string, string> | 'invalido' {
  if (!bruto || bruto.trim() === '') return {};
  try {
    const parseado: unknown = JSON.parse(bruto);
    if (!parseado || typeof parseado !== 'object' || Array.isArray(parseado)) return 'invalido';
    return Object.fromEntries(
      Object.entries(parseado as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    );
  } catch {
    return 'invalido';
  }
}

function nombreUsuarioPeticion(request: Request): string {
  return usuarioDesdeToken(request)?.nombre ?? 'Investigador Tesis';
}

export const evidenceHandlers = [
  http.get(`${API}/evidencia/resumen`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const tri = evidenciaTri();
    const data: EvidenciaResumen = {
      ...PERIODOS_TESIS,
      kpis: kpisTesis(),
      comparativaTri: [
        { etapa: 'Pretest', minutos: tri.promedioPretest },
        { etapa: 'Postest', minutos: tri.promedioPostest },
      ],
    };
    return HttpResponse.json(data);
  }),

  /* ---------------------------------------------------------------- */
  /* Anexo 02 · TRI                                                    */
  /* ---------------------------------------------------------------- */

  http.get(`${API}/evidencia/tri`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(evidenciaTri());
  }),

  http.post(`${API}/evidencia/tri/pretest`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as { registros?: Partial<RegistroTRI>[] };
    const registros = body.registros ?? [];
    if (registros.length === 0) {
      return errores.validacion({ registros: 'Carga al menos un registro' });
    }
    /* Espejo de `cargarPretest`: la carga reemplaza la hoja completa. */
    store.triPretest = registros.map((r, i) => {
      const hora = String(r.horaInicioRegistro ?? '00:00:00');
      return {
        id: `TRI-PR-${String(i + 1).padStart(2, '0')}`,
        n: i + 1,
        fecha: String(r.fecha ?? hoyIso()),
        eventoRegistrado: String(r.eventoRegistrado ?? 'Registro manual'),
        horaInicioRegistro: hora.length === 5 ? `${hora}:00` : hora,
        tiempoMin: Number(r.tiempoMin ?? 0),
        etapa: 'pretest' as const,
        observacion: r.observacion ?? 'Registro manual en hoja de cálculo',
      };
    });
    return HttpResponse.json(
      {
        data: store.triPretest,
        promedioPretest: calcTri(store.triPretest.map((r) => r.tiempoMin)),
      },
      { status: 201 }
    );
  }),

  /* ---------------------------------------------------------------- */
  /* Fuentes externas (sensores · solicitudes · SAP)                   */
  /* ---------------------------------------------------------------- */

  http.get(`${API}/evidencia/fuentes`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    /* `ResponseInterceptor` de la API envuelve todo array en `{ data }`. */
    return HttpResponse.json({ data: resumenFuentes() });
  }),

  http.get(`${API}/evidencia/fuentes/:tipo/plantilla`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const tipo = tipoFuente(String(params.tipo));
    if (!tipo) return errores.noEncontrado(`Fuente externa «${String(params.tipo)}»`);
    return new HttpResponse(generarPlantilla(tipo), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${archivoPlantilla(tipo)}"`,
      },
    });
  }),

  http.post(`${API}/evidencia/fuentes/:tipo/importar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const tipo = tipoFuente(String(params.tipo));
    if (!tipo) return errores.noEncontrado(`Fuente externa «${String(params.tipo)}»`);

    const form = await request.formData();
    const archivo = form.get('archivo');
    if (!(archivo instanceof File)) {
      return errores.validacion({ archivo: 'Adjunta el archivo a importar' });
    }
    if (!extensionAceptada(archivo.name)) {
      return errores.validacion({ archivo: 'Sube un archivo .xlsx o .csv' });
    }
    if (archivo.size > MAX_BYTES_TABLA) {
      return errores.validacion({ archivo: 'El archivo supera los 5 MB' });
    }

    const mapeo = parsearMapeo(typeof form.get('mapeo') === 'string' ? String(form.get('mapeo')) : null);
    if (mapeo === 'invalido') {
      return errores.validacion({
        mapeo: 'Debe ser un JSON `{columnaEsperada: cabeceraDelArchivo}`',
      });
    }

    try {
      const resultado = importarFuente(
        tipo,
        archivo.name,
        await archivo.arrayBuffer(),
        mapeo,
        nombreUsuarioPeticion(request)
      );
      return HttpResponse.json(resultado, { status: 201 });
    } catch (error) {
      if (error instanceof ArchivoSinFilasError) {
        return errores.validacion({ archivo: 'El archivo no tiene filas de datos bajo la cabecera' });
      }
      throw error;
    }
  }),

  http.get(`${API}/evidencia/fuentes/:tipo/importaciones`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const tipo = tipoFuente(String(params.tipo));
    if (!tipo) return errores.noEncontrado(`Fuente externa «${String(params.tipo)}»`);
    return HttpResponse.json({ data: historialImportaciones(tipo) });
  }),

  /* ---------------------------------------------------------------- */
  /* Anexo 03 · TCI                                                    */
  /* ---------------------------------------------------------------- */

  http.post(`${API}/evidencia/tci/validar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const body = (await request.json().catch(() => ({}))) as {
      desde?: string;
      hasta?: string;
      tipos?: TipoRegistroTci[];
    };
    const tipos = body.tipos?.filter((t) => TIPOS_REGISTRO_TCI.includes(t));
    if (body.tipos && (body.tipos.length === 0 || tipos?.length !== body.tipos.length)) {
      return errores.validacion({ tipos: 'Selecciona al menos un tipo' });
    }
    return HttpResponse.json(
      validarTci({
        tipos,
        desde: body.desde,
        hasta: body.hasta,
        hoy: hoyIso(),
        validadoEn: ahoraIso(),
      })
    );
  }),

  http.get(`${API}/evidencia/tci/resumen`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(resumenTci());
  }),

  http.get(`${API}/evidencia/tci`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const tipos = listaQuery(url, 'tipo');
    const resultado = url.searchParams.get('resultado');
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');

    const todas = [...getStore().evaluacionesTci].sort((a, b) => a.n - b.n);
    const registros = todas.map(aEvaluacion).filter((r) => {
      if (tipos.length > 0 && !tipos.includes(r.tipoRegistro)) return false;
      if (resultado === 'valido' && !r.valido) return false;
      if (resultado === 'invalido' && r.valido) return false;
      if (desde && r.fecha < desde) return false;
      if (hasta && r.fecha > hasta) return false;
      return true;
    });

    const pagina = paginar(registros, numeroQuery(url, 'page', 1), numeroQuery(url, 'pageSize', 25));
    return HttpResponse.json({ ...pagina, resumen: resumenTci(todas) });
  }),

  http.patch(`${API}/evidencia/tci/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const fila = getStore().evaluacionesTci.find((e) => e.id === params.id);
    if (!fila) return errores.noEncontrado('Evaluación de calidad');
    const body = (await request.json()) as {
      overrides?: Record<string, boolean | null>;
      observacion?: string;
    };
    if (body.observacion !== undefined && body.observacion.length > 300) {
      return errores.validacion({ observacion: 'Máximo 300 caracteres' });
    }
    aplicarOverrideManual(fila, body.overrides ?? {}, body.observacion);
    return HttpResponse.json({ item: aEvaluacion(fila), resumen: resumenTci() });
  }),

  /* ---------------------------------------------------------------- */
  /* Anexo 04 · TSP                                                    */
  /* ---------------------------------------------------------------- */

  http.get(`${API}/evidencia/tsp`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(evidenciaTsp());
  }),

  http.post(`${API}/evidencia/tsp/invitaciones`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as { invitado?: string; rol?: string };
    const invitado = String(body.invitado ?? '').trim();
    if (invitado.length < 3) {
      return errores.validacion({ invitado: 'Escribe el nombre del invitado' });
    }
    if (invitado.length > 80) return errores.validacion({ invitado: 'Máximo 80 caracteres' });
    if (body.rol !== undefined && body.rol.length > 60) {
      return errores.validacion({ rol: 'Máximo 60 caracteres' });
    }

    const prefijo = `tsp-${new Date().getFullYear()}-`;
    const usados = store.invitacionesTsp
      .filter((s) => s.token.startsWith(prefijo))
      .map((s) => Number(s.token.slice(prefijo.length)))
      .filter((n) => Number.isFinite(n));
    const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;

    const invitacion: InvitacionTSP = {
      token: `${prefijo}${String(siguiente).padStart(2, '0')}`,
      invitado,
      ...(body.rol ? { rol: body.rol } : {}),
      url: '',
      respondida: false,
      creadaEn: ahoraIso(),
    };
    store.invitacionesTsp.push(invitacion);
    return HttpResponse.json(
      { invitacion: aInvitacion(invitacion), resumen: evidenciaTsp() },
      { status: 201 }
    );
  }),

  /* ---------------------------------------------------------------- */
  /* Anexos 05 y 06 · CFS y EP                                         */
  /* ---------------------------------------------------------------- */

  http.get(`${API}/evidencia/cfs`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(evidenciaCfs());
  }),

  http.patch(`${API}/evidencia/cfs/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const item = getStore().verificacionesCfs.find((v) => v.id === params.id);
    if (!item) return errores.noEncontrado('Verificación funcional');
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.cumple !== 'boolean') {
      return errores.validacion({ cumple: 'cumple debe ser booleano' });
    }
    if (typeof body.observacion === 'string' && body.observacion.length > 300) {
      return errores.validacion({ observacion: 'Máximo 300 caracteres' });
    }
    item.cumple = body.cumple;
    if (typeof body.observacion === 'string') item.observacion = body.observacion;
    return HttpResponse.json({ item, resumen: evidenciaCfs() });
  }),

  http.get(`${API}/evidencia/ep`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(evidenciaEp());
  }),

  http.post(`${API}/evidencia/exportar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    await request.json().catch(() => ({}));
    return HttpResponse.json({ id: nextId('EXPEV'), estado: 'generando' }, { status: 202 });
  }),

  /* ---------------------------------------------------------------- */
  /* Encuesta pública (sin sesión)                                     */
  /* ---------------------------------------------------------------- */

  http.get(`${API}/encuesta/:token`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const sesion = getStore().invitacionesTsp.find((s) => s.token === params.token);
    if (!sesion) return errores.noEncontrado('Enlace de encuesta');
    const data: EncuestaPublica = {
      token: sesion.token,
      titulo: ENCUESTA_TITULO,
      descripcion: ENCUESTA_DESCRIPCION,
      items: ITEMS_TSP.map((texto, i) => ({ n: i + 1, texto })),
      respondida: sesion.respondida,
    };
    return HttpResponse.json(data);
  }),

  http.post(`${API}/encuesta/:token`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const sesion = store.invitacionesTsp.find((s) => s.token === params.token);
    if (!sesion) return errores.noEncontrado('Enlace de encuesta');
    if (sesion.respondida) {
      return errores.conflicto('Este enlace de encuesta ya fue utilizado');
    }
    const body = (await request.json()) as { respuestas?: number[]; comentario?: string };
    const respuestas = body.respuestas ?? [];
    if (respuestas.length < ITEMS_TSP.length) {
      return errores.validacion({ respuestas: 'Responde los 8 ítems' });
    }
    if (respuestas.some((r) => !Number.isInteger(r) || r < 1 || r > 5)) {
      return errores.validacion({ respuestas: 'Responde de 1 a 5' });
    }
    if (body.comentario !== undefined && body.comentario.length > 500) {
      return errores.validacion({ comentario: 'Máximo 500 caracteres' });
    }

    const fecha = hoyIso();
    store.respuestasTsp.push({
      id: `TSP-${sesion.token}`,
      token: sesion.token,
      respuestas,
      comentario: body.comentario ?? null,
      fecha,
    });
    sesion.respondida = true;
    sesion.respondidaEn = fecha;

    const planas = store.respuestasTsp.flatMap((r) => r.respuestas);
    const deAcuerdo = planas.filter((v) => v >= 4).length;
    return HttpResponse.json(
      {
        recibido: true,
        respuestas: store.respuestasTsp.length,
        pctAcuerdo: planas.length ? Math.round((deAcuerdo / planas.length) * 1000) / 10 : 0,
      },
      { status: 201 }
    );
  }),
];
