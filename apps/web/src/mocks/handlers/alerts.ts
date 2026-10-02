import { http, HttpResponse } from 'msw';
import type { AlertasResumen, Alerta, EstadoAlerta } from '@mes/types';
import { MENSAJE_CONFLICTO_VERSION, ROLES_ATENDER_ALERTA, ROLES_CONFIRMAR_EP } from '@mes/types';
import { confirmarAcierto, epActual, getStore } from '../store';
import { API, ahoraIso, errores, listaQuery, normalizar, numeroQuery, paginar, preludio } from './_utils';
import { accesoLinea, exigeRoles } from './auth';

/**
 * «Día operativo» de la bandeja, espejo de `diaOperativo` en la API: si hay
 * alertas del día real ese es el día; si no, el más reciente con actividad.
 * Sin esta regla el juego de datos congelado dejaba «Atendidas hoy» en 0.
 */
function diaOperativoAlertas(alertas: readonly Alerta[]): string {
  const hoyReal = ahoraIso().slice(0, 10);
  const fechas = alertas.map((a) => (a.atendidaEn ?? a.generadaEn).slice(0, 10));
  if (fechas.includes(hoyReal)) return hoyReal;
  const masReciente = fechas.reduce((mejor, f) => (f > mejor ? f : mejor), '');
  return masReciente || hoyReal;
}

function resumen(): AlertasResumen {
  const store = getStore();
  const hoy = diaOperativoAlertas(store.alertas);
  return {
    activas: store.alertas.filter((a) => a.estado === 'activa').length,
    atendidasHoy: store.alertas.filter(
      (a) => a.estado === 'atendida' && (a.atendidaEn ?? '').slice(0, 10) === hoy
    ).length,
    /* Igual que la API: sólo atendidas o vencidas sin acierto (las descartadas no admiten confirmación). */
    pendientesConfirmar: store.alertas.filter(esperaConfirmacion).length,
    vencidas: store.alertas.filter((a) => a.estado === 'vencida').length,
    epAcumulada: epActual(),
    /* Con 0 la EP no se ha medido: la UI muestra «—». */
    epConfirmadas: store.registrosEp.length,
  };
}

/** Ya se actuó sobre ella (atendida o vencida) pero falta confirmar el evento real. */
function esperaConfirmacion(a: Alerta): boolean {
  return a.acierto === null && (a.estado === 'atendida' || a.estado === 'vencida');
}

function buscar(id: string): Alerta | undefined {
  return getStore().alertas.find((a) => a.id === id);
}

/** Máquina de estados de la alerta (espejo de `TRANSICIONES` de `alerts.service.ts`). */
const TRANSICIONES = {
  atender: ['activa'],
  descartar: ['activa'],
  confirmar: ['activa', 'atendida', 'vencida'],
} as const satisfies Record<string, readonly EstadoAlerta[]>;

type Accion = keyof typeof TRANSICIONES;

/** `null` si la transición es válida; si no, el motivo en español (409). */
function motivoTransicionInvalida(alerta: Alerta, accion: Accion): string | null {
  const desde = TRANSICIONES[accion] as readonly EstadoAlerta[];
  if (!desde.includes(alerta.estado)) return `No se puede ${accion} una alerta ${alerta.estado}`;
  if (accion === 'confirmar' && alerta.estado === 'activa' && alerta.ventanaFin > ahoraIso()) {
    return 'No se puede confirmar todavía: la ventana de la predicción sigue abierta';
  }
  return null;
}

function textoRecortado(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Espejo de `UmbralesDto`: rangos de cada umbral (422 por campo). */
function validarUmbrales(body: Record<string, unknown>): Record<string, string> {
  const detalles: Record<string, string> = {};
  const rango = (
    campo: string,
    min: number,
    max: number,
    mensajes: [string, string],
    opcional = false,
    entero = false
  ) => {
    const bruto = body[campo];
    if (bruto === undefined && opcional) return;
    const n = typeof bruto === 'number' ? bruto : Number.NaN;
    if (!Number.isFinite(n)) detalles[campo] = 'Debe ser un número';
    else if (entero && !Number.isInteger(n)) detalles[campo] = 'Debe ser un número entero de días';
    else if (n < min) detalles[campo] = mensajes[0];
    else if (n > max) detalles[campo] = mensajes[1];
  };
  rango('velocidadBajoEstandarPct', 1, 50, ['Mínimo 1 %', 'Máximo 50 %']);
  rango('oeeMinimo', 1, 100, ['Mínimo 1 %', 'Máximo 100 %']);
  rango('probabilidadMinima', 50, 99, ['Mínimo 50 %', 'Máximo 99 %']);
  rango('tciToleranciaMin', 0, 60, ['Mínimo 0 min', 'Máximo 60 min'], true);
  rango('tciToleranciaPct', 0, 50, ['Mínimo 0 %', 'Máximo 50 %'], true);
  rango('tciToleranciaDiasSap', 0, 15, ['Mínimo 0 días', 'Máximo 15 días'], true, true);
  return detalles;
}

export const alertsHandlers = [
  http.get(`${API}/alertas/resumen`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(resumen());
  }),

  http.get(`${API}/alertas/recientes`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    /* Igual que la API: las últimas activas por `generadaEn`, entre 1 y 20. */
    const limite = Math.max(1, Math.min(20, numeroQuery(url, 'limit', 3)));
    const data = getStore()
      .alertas.filter((a) => a.estado === 'activa')
      .sort((a, b) => b.generadaEn.localeCompare(a.generadaEn))
      .slice(0, limite);
    return HttpResponse.json({ data });
  }),

  http.get(`${API}/alertas/umbrales`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(getStore().umbrales);
  }),

  http.put(`${API}/alertas/umbrales`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const { usuario, respuesta } = exigeRoles(request, ['jefe', 'supervisor']);
    if (respuesta) return respuesta;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;
    const detalles = validarUmbrales(body);
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    /* Concurrencia optimista (espejo de `guardarUmbrales`): 409 si otra persona guardó después. */
    const vigente = store.umbrales.version ?? 1;
    if (typeof body.version === 'number' && body.version !== vigente) {
      return errores.conflicto(MENSAJE_CONFLICTO_VERSION, {
        version: vigente,
        versionEnviada: body.version,
      });
    }
    const numeroO = (valor: unknown, actual: number) => (typeof valor === 'number' ? valor : actual);
    store.umbrales = {
      ...store.umbrales,
      velocidadBajoEstandarPct: numeroO(body.velocidadBajoEstandarPct, store.umbrales.velocidadBajoEstandarPct),
      oeeMinimo: numeroO(body.oeeMinimo, store.umbrales.oeeMinimo),
      probabilidadMinima: numeroO(body.probabilidadMinima, store.umbrales.probabilidadMinima),
      notificarN8n:
        typeof body.notificarN8n === 'boolean' ? body.notificarN8n : store.umbrales.notificarN8n,
      mostrarTv: typeof body.mostrarTv === 'boolean' ? body.mostrarTv : store.umbrales.mostrarTv,
      /* Las tolerancias TCI son opcionales: si no vienen, se conservan las vigentes. */
      tciToleranciaMin: numeroO(body.tciToleranciaMin, store.umbrales.tciToleranciaMin),
      tciToleranciaPct: numeroO(body.tciToleranciaPct, store.umbrales.tciToleranciaPct),
      tciToleranciaDiasSap: numeroO(body.tciToleranciaDiasSap, store.umbrales.tciToleranciaDiasSap),
      actualizadoEn: ahoraIso(),
      actualizadoPor: usuario.nombre,
      version: vigente + 1,
    };
    return HttpResponse.json(store.umbrales);
  }),

  http.get(`${API}/alertas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const tipos = listaQuery(url, 'tipo');
    const severidades = listaQuery(url, 'severidad');
    const lineaIds = listaQuery(url, 'lineaId');
    const estados = listaQuery(url, 'estado');
    const search = normalizar(url.searchParams.get('search') ?? '');
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');
    const pendientesQ = url.searchParams.get('pendientes');
    const formatoFecha = /^\d{4}-\d{2}-\d{2}$/;
    const detalles: Record<string, string> = {};
    if (desde && !formatoFecha.test(desde)) detalles.desde = 'desde debe tener formato YYYY-MM-DD';
    if (hasta && !formatoFecha.test(hasta)) detalles.hasta = 'hasta debe tener formato YYYY-MM-DD';
    if (pendientesQ !== null && pendientesQ !== 'true' && pendientesQ !== 'false') {
      detalles.pendientes = 'pendientes must be a boolean value';
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    let items = [...getStore().alertas];
    if (tipos.length > 0) items = items.filter((a) => tipos.includes(a.tipo));
    if (severidades.length > 0) items = items.filter((a) => severidades.includes(a.severidad));
    if (lineaIds.length > 0) items = items.filter((a) => lineaIds.includes(a.lineaId));
    if (estados.length > 0) items = items.filter((a) => estados.includes(a.estado));
    /* `pendientes=true`: sólo las que esperan el resultado real, paginadas aquí. */
    if (pendientesQ === 'true') items = items.filter(esperaConfirmacion);
    if (desde) items = items.filter((a) => a.generadaEn.slice(0, 10) >= desde);
    if (hasta) items = items.filter((a) => a.generadaEn.slice(0, 10) <= hasta);
    if (search) {
      items = items.filter((a) => normalizar(`${a.prediccion} ${a.lineaNombre}`).includes(search));
    }
    items.sort((a, b) => b.generadaEn.localeCompare(a.generadaEn));

    return HttpResponse.json(paginar(items, numeroQuery(url, 'page', 1), numeroQuery(url, 'pageSize', 25)));
  }),

  http.get(`${API}/alertas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const alerta = buscar(String(params.id));
    if (!alerta) return errores.noEncontrado('Alerta');
    return HttpResponse.json(alerta);
  }),

  /** Jefe, supervisor y maquinista de la línea; sólo desde `activa`. */
  http.post(`${API}/alertas/:id/atender`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const { usuario, respuesta } = exigeRoles(request, ROLES_ATENDER_ALERTA);
    if (respuesta) return respuesta;
    const body = (await request.json()) as Record<string, unknown>;
    const accionTomada = textoRecortado(body.accionTomada);
    if (accionTomada.length < 10) {
      return errores.validacion({ accionTomada: 'Describe la acción tomada (mínimo 10 caracteres)' });
    }
    if (accionTomada.length > 300) return errores.validacion({ accionTomada: 'Máximo 300 caracteres' });
    const alerta = buscar(String(params.id));
    if (!alerta) return errores.noEncontrado('Alerta');
    const sinAcceso = accesoLinea(usuario, alerta.lineaId);
    if (sinAcceso) return sinAcceso;
    const motivo = motivoTransicionInvalida(alerta, 'atender');
    if (motivo) return errores.conflicto(motivo, { estado: alerta.estado });
    alerta.estado = 'atendida';
    alerta.accionTomada = accionTomada;
    alerta.atendidaPor = usuario.nombre;
    alerta.atendidaEn = ahoraIso();
    return HttpResponse.json({ alerta, resumen: resumen() });
  }),

  /** Jefe, supervisor y maquinista de la línea; sólo desde `activa`. */
  http.post(`${API}/alertas/:id/descartar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const { usuario, respuesta } = exigeRoles(request, ROLES_ATENDER_ALERTA);
    if (respuesta) return respuesta;
    const body = (await request.json()) as Record<string, unknown>;
    const motivoDescarte = textoRecortado(body.motivo);
    if (motivoDescarte.length < 5) return errores.validacion({ motivo: 'Indica el motivo del descarte' });
    if (motivoDescarte.length > 300) return errores.validacion({ motivo: 'Máximo 300 caracteres' });
    const alerta = buscar(String(params.id));
    if (!alerta) return errores.noEncontrado('Alerta');
    const sinAcceso = accesoLinea(usuario, alerta.lineaId);
    if (sinAcceso) return sinAcceso;
    const motivo = motivoTransicionInvalida(alerta, 'descartar');
    if (motivo) return errores.conflicto(motivo, { estado: alerta.estado });
    alerta.estado = 'descartada';
    alerta.observacion = motivoDescarte;
    alerta.atendidaPor = usuario.nombre;
    alerta.atendidaEn = ahoraIso();
    return HttpResponse.json({ alerta, resumen: resumen() });
  }),

  /** Confirmar el evento real (Anexo 06): sólo jefe y supervisor. */
  http.post(`${API}/alertas/:id/confirmar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const { respuesta } = exigeRoles(request, ROLES_CONFIRMAR_EP);
    if (respuesta) return respuesta;
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.ocurrio !== 'boolean') {
      return errores.validacion({ ocurrio: 'Indica si el evento ocurrió' });
    }
    const alerta = buscar(String(params.id));
    if (!alerta) return errores.noEncontrado('Alerta');
    const motivo = motivoTransicionInvalida(alerta, 'confirmar');
    if (motivo) return errores.conflicto(motivo, { estado: alerta.estado });
    confirmarAcierto(alerta, body.ocurrio, textoRecortado(body.observacion) || undefined);
    return HttpResponse.json({ alerta, resumen: resumen(), ep: epActual() });
  }),

  /**
   * Lote atómico (espejo de `confirmarLote`): si una alerta no existe (404),
   * está repetida (422) o no admite confirmación (409), no se confirma ninguna.
   */
  http.post(`${API}/alertas/confirmar-lote`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const { respuesta } = exigeRoles(request, ROLES_CONFIRMAR_EP);
    if (respuesta) return respuesta;
    const body = (await request.json()) as {
      confirmaciones?: { alertaId: string; ocurrio: boolean; observacion?: string }[];
    };
    const confirmaciones = Array.isArray(body.confirmaciones) ? body.confirmaciones : [];
    if (confirmaciones.length === 0) {
      return errores.validacion({ confirmaciones: 'Confirma al menos una alerta' });
    }
    if (confirmaciones.length > 200) {
      return errores.validacion({ confirmaciones: 'Máximo 200 alertas por lote' });
    }
    if (confirmaciones.some((c) => typeof c.ocurrio !== 'boolean')) {
      return errores.validacion({ confirmaciones: 'Indica si el evento ocurrió' });
    }
    const ids = confirmaciones.map((c) => c.alertaId);
    const repetidas = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repetidas.length > 0) {
      return errores.validacion({
        confirmaciones: `Alertas repetidas en el lote: ${[...new Set(repetidas)].join(', ')}`,
      });
    }
    const inexistentes = ids.filter((id) => !buscar(id));
    if (inexistentes.length > 0) return errores.noEncontrado(`Alerta ${inexistentes.join(', ')}`);
    const invalidas = ids
      .map((id) => buscar(id)!)
      .filter((a) => motivoTransicionInvalida(a, 'confirmar') !== null);
    if (invalidas.length > 0) {
      return errores.conflicto('Algunas alertas no admiten confirmación', {
        alertas: invalidas
          .map((a) => `${a.id}: ${motivoTransicionInvalida(a, 'confirmar')}`)
          .join(' · '),
      });
    }
    const actualizadas: Alerta[] = [];
    for (const c of confirmaciones) {
      const alerta = buscar(c.alertaId)!;
      confirmarAcierto(alerta, c.ocurrio, textoRecortado(c.observacion) || undefined);
      actualizadas.push(alerta);
    }
    return HttpResponse.json({ data: actualizadas, resumen: resumen(), ep: epActual() });
  }),
];
