import { http, HttpResponse } from 'msw';
import type { AlertasResumen, Alerta } from '@mes/types';
import { confirmarAcierto, epActual, getStore } from '../store';
import { API, ahoraIso, errores, listaQuery, normalizar, numeroQuery, paginar, preludio } from './_utils';

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
    pendientesConfirmar: store.alertas.filter((a) => a.acierto === null && a.estado !== 'activa').length,
    vencidas: store.alertas.filter((a) => a.estado === 'vencida').length,
    epAcumulada: epActual(),
  };
}

function buscar(id: string): Alerta | undefined {
  return getStore().alertas.find((a) => a.id === id);
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
    const limite = numeroQuery(url, 'limit', 3);
    const data = getStore()
      .alertas.filter((a) => a.estado === 'activa')
      .sort((a, b) => b.probabilidad - a.probabilidad)
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
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;
    store.umbrales = {
      ...store.umbrales,
      velocidadBajoEstandarPct: Number(body.velocidadBajoEstandarPct ?? store.umbrales.velocidadBajoEstandarPct),
      oeeMinimo: Number(body.oeeMinimo ?? store.umbrales.oeeMinimo),
      probabilidadMinima: Number(body.probabilidadMinima ?? store.umbrales.probabilidadMinima),
      notificarN8n: Boolean(body.notificarN8n),
      mostrarTv: Boolean(body.mostrarTv),
      tciToleranciaMin: Number(body.tciToleranciaMin ?? store.umbrales.tciToleranciaMin),
      tciToleranciaPct: Number(body.tciToleranciaPct ?? store.umbrales.tciToleranciaPct),
      tciToleranciaDiasSap: Number(
        body.tciToleranciaDiasSap ?? store.umbrales.tciToleranciaDiasSap
      ),
      actualizadoEn: ahoraIso(),
      actualizadoPor: 'Carlos Mendoza',
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

    let items = [...getStore().alertas];
    if (tipos.length > 0) items = items.filter((a) => tipos.includes(a.tipo));
    if (severidades.length > 0) items = items.filter((a) => severidades.includes(a.severidad));
    if (lineaIds.length > 0) items = items.filter((a) => lineaIds.includes(a.lineaId));
    if (estados.length > 0) items = items.filter((a) => estados.includes(a.estado));
    if (search) items = items.filter((a) => normalizar(a.prediccion).includes(search));
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

  http.post(`${API}/alertas/:id/atender`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const alerta = buscar(String(params.id));
    if (!alerta) return errores.noEncontrado('Alerta');
    if (alerta.estado === 'confirmada') {
      return errores.conflicto('La alerta ya fue confirmada', { estado: alerta.estado });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const accionTomada = String(body.accionTomada ?? '').trim();
    if (accionTomada.length < 10) {
      return errores.validacion({ accionTomada: 'Describe la acción tomada (mínimo 10 caracteres)' });
    }
    alerta.estado = 'atendida';
    alerta.accionTomada = accionTomada;
    alerta.atendidaPor = 'Ana Ríos';
    alerta.atendidaEn = ahoraIso();
    return HttpResponse.json({ alerta, resumen: resumen() });
  }),

  http.post(`${API}/alertas/:id/descartar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const alerta = buscar(String(params.id));
    if (!alerta) return errores.noEncontrado('Alerta');
    const body = (await request.json()) as Record<string, unknown>;
    alerta.estado = 'descartada';
    alerta.observacion = String(body.motivo ?? 'Descartada por el supervisor');
    return HttpResponse.json({ alerta, resumen: resumen() });
  }),

  http.post(`${API}/alertas/:id/confirmar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const alerta = buscar(String(params.id));
    if (!alerta) return errores.noEncontrado('Alerta');
    if (alerta.acierto !== null) {
      return errores.conflicto('El resultado real de esta alerta ya fue confirmado');
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.ocurrio !== 'boolean') {
      return errores.validacion({ ocurrio: 'Indica si el evento ocurrió' });
    }
    confirmarAcierto(
      alerta,
      body.ocurrio,
      typeof body.observacion === 'string' ? body.observacion : undefined
    );
    return HttpResponse.json({ alerta, resumen: resumen(), ep: epActual() });
  }),

  http.post(`${API}/alertas/confirmar-lote`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const body = (await request.json()) as {
      confirmaciones?: { alertaId: string; ocurrio: boolean; observacion?: string }[];
    };
    const confirmaciones = body.confirmaciones ?? [];
    if (confirmaciones.length === 0) {
      return errores.validacion({ confirmaciones: 'Confirma al menos una alerta' });
    }
    const actualizadas: Alerta[] = [];
    for (const c of confirmaciones) {
      const alerta = buscar(c.alertaId);
      if (!alerta || alerta.estado === 'confirmada') continue;
      confirmarAcierto(alerta, c.ocurrio, c.observacion);
      actualizadas.push(alerta);
    }
    return HttpResponse.json({ data: actualizadas, resumen: resumen(), ep: epActual() });
  }),
];
