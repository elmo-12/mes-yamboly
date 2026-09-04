import { http, HttpResponse } from 'msw';
import type { LineaTimeline, TiempoRealResumen, TimelineEvento, TvResumen, TvRow } from '@mes/types';
import { ESTADO_LINEA_LABEL } from '@mes/types';
import {
  AHORA_ISO,
  lineaPorId,
  TURNO_ACTUAL,
  TURNO_ACTUAL_LABEL,
  TURNO_ACTUAL_RANGO,
} from '../data';
import { buscarCausaMerma, getStore } from '../store';
import { API, ahoraIso, errores, listaQuery, preludio } from './_utils';

function resumen(): TiempoRealResumen {
  return {
    actualizadoEn: ahoraIso(),
    diaOperativo: AHORA_ISO.slice(0, 10),
    turno: TURNO_ACTUAL,
    turnoLabel: TURNO_ACTUAL_LABEL,
    turnoRango: TURNO_ACTUAL_RANGO,
    lineas: getStore().lineaEstados,
  };
}

function timeline(lineaId: string): LineaTimeline | null {
  const store = getStore();
  const linea = lineaPorId.get(lineaId);
  if (!linea) return null;
  const estado = store.lineaEstados.find((l) => l.lineaId === lineaId);
  const ordenId = estado?.orden?.id;
  const eventos: TimelineEvento[] = [];

  if (ordenId) {
    const orden = store.ordenes.find((o) => o.id === ordenId);
    if (orden) {
      eventos.push({
        id: `EV-${orden.id}-inicio`,
        hora: orden.inicio.slice(11, 16),
        tipo: 'inicio_of',
        titulo: `Inicio ${orden.codigo}`,
        detalle: `${estado?.orden?.productoNombre ?? ''} · ${orden.planificado} unidades planificadas`,
      });
    }
    for (const parada of store.paradas.filter((p) => p.ordenId === ordenId)) {
      const causa = store.causasParada.find((c) => c.id === parada.causaId);
      const tipo = store.causasParada.find((c) => c.id === parada.tipoCausaId);
      eventos.push({
        id: `EV-${parada.id}`,
        hora: parada.inicio.slice(11, 16),
        tipo: 'parada',
        titulo: `Parada ${tipo?.codigo ?? causa?.codigo ?? ''}`,
        detalle: `${causa?.codigo ?? ''} ${causa?.nombre ?? ''} · ${parada.accionTomada}`,
        duracionMin: parada.duracionMin,
      });
    }
    for (const velocidad of store.velocidades.filter((v) => v.ordenId === ordenId)) {
      eventos.push({
        id: `EV-${velocidad.id}`,
        hora: velocidad.registradaEn.slice(11, 16),
        tipo: 'velocidad',
        titulo: `Velocidad ${velocidad.velocidadReal}`,
        detalle: `Estándar ${velocidad.velocidadEstandar} u/min · desvío ${velocidad.desvioPct} %`,
      });
    }
    for (const merma of store.mermas.filter((m) => m.ordenId === ordenId)) {
      const causa = buscarCausaMerma(merma.causaId);
      eventos.push({
        id: `EV-${merma.id}`,
        hora: merma.registradaEn.slice(11, 16),
        tipo: 'merma',
        titulo: `Merma ${merma.tipo} ${merma.cantidadKg} kg`,
        detalle: `${causa?.codigo ?? ''} ${causa?.nombre ?? ''} · ${merma.sabor}`,
      });
    }
    const ordenActual = store.ordenes.find((o) => o.id === ordenId);
    if (ordenActual?.fin) {
      eventos.push({
        id: `EV-${ordenActual.id}-fin`,
        hora: ordenActual.fin.slice(11, 16),
        tipo: 'fin_of',
        titulo: `Cierre ${ordenActual.codigo}`,
        detalle: `${ordenActual.producido} unidades · OEE ${ordenActual.oee.oee} %`,
      });
    }
    if (estado?.alerta) {
      /* Paridad con la API: la alerta se ubica por su `generadaEn`. */
      eventos.push({
        id: `EV-${estado.alerta.id}`,
        hora: estado.alerta.generadaEn.slice(11, 16),
        tipo: 'alerta',
        titulo: `Alerta · ${estado.alerta.riesgo} %`,
        detalle: estado.alerta.texto,
      });
    }
  }

  eventos.sort((a, b) => a.hora.localeCompare(b.hora));
  return {
    lineaId,
    lineaCodigo: linea.codigo,
    lineaNombre: linea.nombre,
    ordenCodigo: estado?.orden?.codigo,
    eventos,
  };
}

export const realtimeHandlers = [
  http.get(`${API}/tiempo-real/lineas/:id/timeline`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const data = timeline(String(params.id));
    if (!data) return errores.noEncontrado('Línea');
    return HttpResponse.json(data);
  }),

  http.get(`${API}/tiempo-real/lineas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaIds = listaQuery(url, 'lineaId');
    const estados = listaQuery(url, 'estado');
    const base = resumen();
    let lineas = base.lineas;
    if (lineaIds.length > 0) lineas = lineas.filter((l) => lineaIds.includes(l.lineaId));
    if (estados.length > 0) lineas = lineas.filter((l) => estados.includes(l.estado));
    return HttpResponse.json({ ...base, lineas });
  }),

  http.get(`${API}/tiempo-real/tv`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const filas: TvRow[] = getStore().lineaEstados.map((l) => ({
      lineaId: l.lineaId,
      lineaCodigo: l.lineaCodigo,
      lineaNombre: l.lineaNombre,
      estado: l.estado,
      estadoLabel: ESTADO_LINEA_LABEL[l.estado],
      producido: l.producido,
      plan: l.plan,
      avancePct: l.plan > 0 ? Math.round((l.producido / l.plan) * 1000) / 10 : 0,
      velocidad: l.velocidad,
      velocidadEstandar: l.velocidadEstandar,
      tiempoEnEstadoMin: l.tiempoEnEstadoMin,
      detalle: l.ultimaParada
        ? `${l.ultimaParada.causaCodigo} ${l.ultimaParada.causaNombre}`
        : l.alerta?.texto,
    }));
    const data: TvResumen = {
      actualizadoEn: ahoraIso(),
      turnoLabel: TURNO_ACTUAL_LABEL,
      filas,
    };
    return HttpResponse.json(data);
  }),

  /** SSE simulado: emite 3 snapshots y cierra (el cliente reconecta solo). */
  http.get(`${API}/tiempo-real/stream`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let enviados = 0;
        const emitir = () => {
          const payload = JSON.stringify({
            tipo: 'estado',
            emitidoEn: ahoraIso(),
            payload: resumen(),
          });
          controller.enqueue(encoder.encode(`event: estado\ndata: ${payload}\n\n`));
          enviados += 1;
          if (enviados >= 3) {
            controller.close();
            return;
          }
          setTimeout(emitir, 3000);
        };
        emitir();
      },
    });
    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }),
];
