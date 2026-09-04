import { http, HttpResponse } from 'msw';
import type { Parada } from '@mes/types';
import { minutosEntre } from '@mes/shared';
import {
  getStore,
  nextId,
  recalcularOrden,
  registrarBitacora,
  registrarTri,
  sincronizarTiempoReal,
} from '../store';
import { API, ahoraIso, errores, listaQuery, numeroQuery, paginar, preludio } from './_utils';
import { enriquecerParada } from './_enrich';
import { usuarioDesdeToken } from './auth';

function textoCausa(causaId: string): string {
  const causa = getStore().causasParada.find((c) => c.id === causaId);
  return causa ? `${causa.codigo} ${causa.nombre}` : 'parada';
}

export const downtimesHandlers = [
  http.get(`${API}/paradas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const store = getStore();
    const lineaIds = listaQuery(url, 'lineaId');
    const causaIds = listaQuery(url, 'causaId');
    const ordenId = url.searchParams.get('ordenId');
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');
    const abiertas = url.searchParams.get('abiertas');

    let items = [...store.paradas];
    if (ordenId) items = items.filter((p) => p.ordenId === ordenId);
    if (lineaIds.length > 0) items = items.filter((p) => lineaIds.includes(p.lineaId));
    if (causaIds.length > 0) items = items.filter((p) => causaIds.includes(p.causaId) || causaIds.includes(p.tipoCausaId));
    if (desde) items = items.filter((p) => p.inicio.slice(0, 10) >= desde);
    if (hasta) items = items.filter((p) => p.inicio.slice(0, 10) <= hasta);
    if (abiertas === 'true') items = items.filter((p) => p.fin === null);
    items.sort((a, b) => b.inicio.localeCompare(a.inicio));

    return HttpResponse.json(
      paginar(items.map(enriquecerParada), numeroQuery(url, 'page', 1), numeroQuery(url, 'pageSize', 25))
    );
  }),

  http.post(`${API}/paradas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;
    const causaId = String(body.causaId ?? '');
    const causa = store.causasParada.find((c) => c.id === causaId);
    if (!causa) return errores.validacion({ causaId: 'Selecciona una causa específica válida' });
    if (!String(body.accionTomada ?? '').trim()) {
      return errores.validacion({ accionTomada: 'La acción tomada es obligatoria' });
    }
    if (causa.requiereSolicitud && !String(body.numeroSolicitud ?? '').trim()) {
      return errores.validacion({ numeroSolicitud: 'Esta causa requiere un N° de solicitud' });
    }

    const inicio = String(body.inicio ?? ahoraIso());
    const parada: Parada = {
      id: nextId('PAR'),
      ordenId: String(body.ordenId ?? ''),
      lineaId: String(body.lineaId ?? ''),
      causaId,
      tipoCausaId: String(body.tipoCausaId ?? causa.parentId ?? causaId),
      inicio,
      fin: null,
      duracionMin: 0,
      accionTomada: String(body.accionTomada ?? ''),
      numeroSolicitud: body.numeroSolicitud ? String(body.numeroSolicitud) : undefined,
      evidenciaUrl: body.evidenciaUrl ? String(body.evidenciaUrl) : undefined,
      afectaOee: body.afectaOee === undefined ? causa.afectaOee : Boolean(body.afectaOee),
      responsableId: String(body.responsableId ?? 'USR-02'),
      origen: (body.origen as Parada['origen']) ?? 'manual',
      deteccionId: body.deteccionId ? String(body.deteccionId) : undefined,
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
    };
    store.paradas.unshift(parada);
    recalcularOrden(parada.ordenId);
    sincronizarTiempoReal(parada);
    registrarTri(`Parada ${textoCausa(causaId)}`, parada.tiempoRegistroSeg, parada.inicio.slice(0, 10));

    const usuario = usuarioDesdeToken(request);
    registrarBitacora({
      ordenId: parada.ordenId,
      fecha: parada.inicio,
      usuario: usuario?.nombre ?? 'Jorge Quispe',
      usuarioIniciales: usuario?.iniciales ?? 'JQ',
      tipo: 'parada',
      texto: `${usuario?.nombre ?? 'Jorge Quispe'} registró la parada ${parada.inicio.slice(11, 16)} ${textoCausa(causaId)}`,
    });

    return HttpResponse.json(enriquecerParada(parada), { status: 201 });
  }),

  http.patch(`${API}/paradas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const parada = store.paradas.find((p) => p.id === params.id);
    if (!parada) return errores.noEncontrado('Parada');
    const body = (await request.json()) as Record<string, unknown>;
    const causaAnterior = parada.causaId;
    Object.assign(parada, body);
    if (parada.fin) parada.duracionMin = minutosEntre(parada.inicio, parada.fin);
    recalcularOrden(parada.ordenId);

    const usuario = usuarioDesdeToken(request);
    if (body.causaId && body.causaId !== causaAnterior) {
      registrarBitacora({
        ordenId: parada.ordenId,
        fecha: ahoraIso(),
        usuario: usuario?.nombre ?? 'Ana Ríos',
        usuarioIniciales: usuario?.iniciales ?? 'AR',
        tipo: 'edicion',
        texto: `${usuario?.nombre ?? 'Ana Ríos'} editó la causa de la parada ${parada.inicio.slice(11, 16)}: ${textoCausa(causaAnterior)} → ${textoCausa(parada.causaId)}`,
      });
    }
    return HttpResponse.json(enriquecerParada(parada));
  }),

  http.post(`${API}/paradas/:id/finalizar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const parada = store.paradas.find((p) => p.id === params.id);
    if (!parada) return errores.noEncontrado('Parada');
    if (parada.fin) return errores.conflicto('La parada ya fue finalizada', { fin: parada.fin });
    const body = (await request.json()) as Record<string, unknown>;
    parada.fin = String(body.fin ?? ahoraIso());
    parada.duracionMin = minutosEntre(parada.inicio, parada.fin);
    if (typeof body.comentarioCierre === 'string') parada.comentarioCierre = body.comentarioCierre;
    sincronizarTiempoReal(parada);
    recalcularOrden(parada.ordenId);
    return HttpResponse.json(enriquecerParada(parada));
  }),

  http.get(`${API}/detecciones-iot`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const estado = url.searchParams.get('estado');
    const store = getStore();
    const data = estado ? store.detecciones.filter((d) => d.estado === estado) : store.detecciones;
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/detecciones-iot/:id/confirmar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const deteccion = store.detecciones.find((d) => d.id === params.id);
    if (!deteccion) return errores.noEncontrado('Detección IoT');
    if (deteccion.estado !== 'sugerida') {
      return errores.conflicto('La detección ya fue procesada', { estado: deteccion.estado });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const causa = store.causasParada.find((c) => c.id === body.causaId);
    if (!causa) return errores.validacion({ causaId: 'Selecciona una causa válida' });

    const ordenLinea = store.ordenes.find(
      (o) => o.lineaId === deteccion.lineaId && o.estado === 'en_curso'
    );
    const parada: Parada = {
      id: nextId('PAR'),
      ordenId: ordenLinea?.id ?? '',
      lineaId: deteccion.lineaId,
      causaId: causa.id,
      tipoCausaId: causa.parentId ?? causa.id,
      inicio: deteccion.detectadaEn,
      fin: null,
      duracionMin: deteccion.minutos,
      accionTomada: String(body.accionTomada ?? 'Parada confirmada desde la detección del sensor'),
      afectaOee: causa.afectaOee,
      responsableId: 'USR-08',
      origen: 'iot',
      deteccionId: deteccion.id,
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
    };
    store.paradas.unshift(parada);
    deteccion.estado = 'confirmada';
    deteccion.paradaId = parada.id;
    recalcularOrden(parada.ordenId);
    sincronizarTiempoReal(parada);
    registrarTri(`Parada IoT ${textoCausa(causa.id)}`, parada.tiempoRegistroSeg, parada.inicio.slice(0, 10));
    registrarBitacora({
      ordenId: parada.ordenId,
      fecha: ahoraIso(),
      usuario: 'Sistema',
      usuarioIniciales: 'SY',
      tipo: 'sistema',
      texto: `Sistema vinculó la detección de sensor a la parada ${parada.inicio.slice(11, 16)} · ${textoCausa(causa.id)}`,
    });
    return HttpResponse.json({ deteccion, parada: enriquecerParada(parada) }, { status: 201 });
  }),

  http.post(`${API}/detecciones-iot/:id/descartar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const deteccion = store.detecciones.find((d) => d.id === params.id);
    if (!deteccion) return errores.noEncontrado('Detección IoT');
    deteccion.estado = 'descartada';
    const linea = store.lineaEstados.find((l) => l.lineaId === deteccion.lineaId);
    if (linea && linea.estado === 'sugerida') {
      linea.estado = 'produciendo';
      linea.velocidad = linea.velocidadEstandar;
      linea.deteccion = undefined;
    }
    return HttpResponse.json(deteccion);
  }),
];
