import { http, HttpResponse } from 'msw';
import type { Merma } from '@mes/types';
import { causaMermaPorId } from '../data';
import { getStore, nextId, recalcularOrden, registrarBitacora, registrarTri } from '../store';
import { API, ahoraIso, errores, listaQuery, numeroQuery, paginar, preludio } from './_utils';
import { enriquecerMerma } from './_enrich';
import { usuarioDesdeToken } from './auth';

export const scrapHandlers = [
  http.get(`${API}/mermas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const store = getStore();
    const lineaIds = listaQuery(url, 'lineaId');
    const tipos = listaQuery(url, 'tipo');
    const causaIds = listaQuery(url, 'causaId');
    const ordenId = url.searchParams.get('ordenId');
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');

    let items = [...store.mermas];
    if (ordenId) items = items.filter((m) => m.ordenId === ordenId);
    if (lineaIds.length > 0) items = items.filter((m) => lineaIds.includes(m.lineaId));
    if (tipos.length > 0) items = items.filter((m) => tipos.includes(m.tipo));
    if (causaIds.length > 0) items = items.filter((m) => causaIds.includes(m.causaId));
    if (desde) items = items.filter((m) => m.registradaEn.slice(0, 10) >= desde);
    if (hasta) items = items.filter((m) => m.registradaEn.slice(0, 10) <= hasta);
    items.sort((a, b) => b.registradaEn.localeCompare(a.registradaEn));

    return HttpResponse.json(
      paginar(items.map(enriquecerMerma), numeroQuery(url, 'page', 1), numeroQuery(url, 'pageSize', 25))
    );
  }),

  http.post(`${API}/mermas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;
    const cantidadKg = Number(body.cantidadKg ?? 0);
    if (!(cantidadKg > 0)) {
      return errores.validacion({ cantidadKg: 'La cantidad debe ser mayor que 0' });
    }
    const causa = causaMermaPorId.get(String(body.causaId ?? ''));
    if (!causa) return errores.validacion({ causaId: 'Selecciona una causa de merma válida' });

    const merma: Merma = {
      id: nextId('MER'),
      ordenId: String(body.ordenId ?? ''),
      lineaId: String(body.lineaId ?? ''),
      tipo: (body.tipo as Merma['tipo']) ?? 'EP',
      cantidadKg,
      sabor: String(body.sabor ?? 'Vainilla'),
      causaId: causa.id,
      responsableId: String(body.responsableId ?? 'USR-04'),
      codigoBalde: body.codigoBalde ? String(body.codigoBalde) : undefined,
      enviarPasteurizacion: Boolean(body.enviarPasteurizacion),
      registradaEn: ahoraIso(),
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
      observacion: body.observacion ? String(body.observacion) : undefined,
    };
    store.mermas.unshift(merma);
    recalcularOrden(merma.ordenId);
    registrarTri(`Merma ${merma.tipo} ${merma.cantidadKg} kg`, merma.tiempoRegistroSeg, merma.registradaEn.slice(0, 10));

    const usuario = usuarioDesdeToken(request);
    registrarBitacora({
      ordenId: merma.ordenId,
      fecha: merma.registradaEn,
      usuario: usuario?.nombre ?? 'María Torres',
      usuarioIniciales: usuario?.iniciales ?? 'MT',
      tipo: 'merma',
      texto: `${usuario?.nombre ?? 'María Torres'} registró merma ${merma.tipo} ${merma.cantidadKg} kg · ${causa.codigo} ${causa.nombre}`,
    });

    return HttpResponse.json(enriquecerMerma(merma), { status: 201 });
  }),

  http.patch(`${API}/mermas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const merma = store.mermas.find((m) => m.id === params.id);
    if (!merma) return errores.noEncontrado('Merma');
    Object.assign(merma, (await request.json()) as Partial<Merma>);
    recalcularOrden(merma.ordenId);
    return HttpResponse.json(enriquecerMerma(merma));
  }),
];
