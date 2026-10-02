import { http, HttpResponse } from 'msw';
import type { SincronizacionOrdenesSap } from '@mes/types';
import { getStore } from '../store';
import { API, ahoraIso, normalizar, preludio } from './_utils';
import { enriquecerOrdenSap } from './_enrich';
import { exigeRol } from './auth';

/**
 * Órdenes SAP pendientes (espejo de `OrdenesSapController`). En modo mock no
 * hay origen SAP: «Sincronizar» responde como un origen que no trae cambios.
 */
export const ordenesSapHandlers = [
  http.get(`${API}/ordenes-sap`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaId = url.searchParams.get('lineaId');
    const q = normalizar(url.searchParams.get('q')?.trim() ?? '');
    const data = getStore()
      .ordenesSap.filter((o) => o.ordenId === null && o.productoId !== null)
      .filter((o) => !lineaId || o.lineaId === lineaId)
      .filter(
        (o) =>
          !q ||
          normalizar(o.numero).includes(q) ||
          normalizar(o.codigoProducto).includes(q) ||
          normalizar(o.productoNombre).includes(q)
      )
      .sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          a.turno.localeCompare(b.turno) ||
          a.numero.localeCompare(b.numero) ||
          a.id.localeCompare(b.id)
      )
      .map(enriquecerOrdenSap);
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/ordenes-sap/sincronizar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const pendientes = getStore().ordenesSap.filter((o) => o.ordenId === null);
    const sincronizadaEn = ahoraIso();
    /* Se refrescan las pendientes: la cabecera de Órdenes muestra esta hora. */
    for (const fila of pendientes) fila.sincronizadaEn = sincronizadaEn;
    const resultado: SincronizacionOrdenesSap = {
      leidas: pendientes.length,
      insertadas: 0,
      actualizadas: pendientes.length,
      eliminadas: 0,
      omitidas: 0,
      sinProducto: pendientes.filter((o) => o.productoId === null).length,
      sincronizadaEn,
    };
    return HttpResponse.json(resultado);
  }),
];
