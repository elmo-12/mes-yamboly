import { http, HttpResponse } from 'msw';
import type { OrdenFabricacion, OrdenesResumen, Periodo, Turno } from '@mes/types';
import { rangoPeriodo } from '@mes/shared';
import {
  HOY,
  TOTAL_HISTORICO_ORDENES,
  TURNO_ACTUAL,
  colaboradoresBase,
  lineas,
  productoPorId,
} from '../data';
import { getStore, parActivo, recalcularOrden, registrarBitacora } from '../store';
import {
  API,
  ahoraIso,
  errores,
  listaQuery,
  normalizar,
  numeroQuery,
  paginar,
  preludio,
} from './_utils';
import { enriquecerMerma, enriquecerOrden, enriquecerParada, enriquecerVelocidad } from './_enrich';
import { usuarioDesdeToken } from './auth';

/** Primera línea del maestro real: solo se usa si el cuerpo no trae `lineaId`. */
const LINEA_POR_DEFECTO = lineas[0]?.id ?? '';

function filtrar(url: URL): OrdenFabricacion[] {
  const store = getStore();
  const lineaIds = listaQuery(url, 'lineaId');
  const turnos = listaQuery(url, 'turno') as Turno[];
  const estados = listaQuery(url, 'estado');
  const search = normalizar(url.searchParams.get('search') ?? '');
  const periodo = url.searchParams.get('periodo') as Periodo | null;
  const desdeQ = url.searchParams.get('desde');
  const hastaQ = url.searchParams.get('hasta');

  let rango: { desde: string; hasta: string } | null = null;
  if (desdeQ && hastaQ) rango = { desde: desdeQ, hasta: hastaQ };
  else if (periodo && periodo !== 'personalizado') rango = rangoPeriodo(periodo, HOY);

  let items = [...store.ordenes];
  if (rango) items = items.filter((o) => o.fecha >= rango!.desde && o.fecha <= rango!.hasta);
  if (lineaIds.length > 0) items = items.filter((o) => lineaIds.includes(o.lineaId));
  if (turnos.length > 0) items = items.filter((o) => turnos.includes(o.turno));
  if (estados.length > 0) items = items.filter((o) => estados.includes(o.estado));
  if (search) {
    items = items.filter((o) => {
      const producto = productoPorId.get(o.productoId)?.nombre ?? '';
      return (
        normalizar(o.codigo).includes(search) ||
        normalizar(o.lote).includes(search) ||
        normalizar(producto).includes(search)
      );
    });
  }

  const sort = url.searchParams.get('sort') ?? 'fecha';
  const dir = url.searchParams.get('orden') === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    if (sort === 'oee') return (a.oee.oee - b.oee.oee) * dir;
    if (sort === 'producido') return (a.producido - b.producido) * dir;
    if (sort === 'codigo') return a.codigo.localeCompare(b.codigo) * dir;
    return (a.fecha === b.fecha ? a.codigo.localeCompare(b.codigo) : a.fecha.localeCompare(b.fecha)) * dir;
  });
  return items;
}

export const ordersHandlers = [
  http.get(`${API}/ordenes/resumen`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const resumen: OrdenesResumen = {
      /* Total histórico del repositorio (header y summary card de la spec 05.A). */
      todas: TOTAL_HISTORICO_ORDENES,
      porValidar: store.ordenes.filter((o) => o.estado === 'por_validar').length,
      conParadas: store.ordenes.filter((o) => o.paradasCount > 0).length,
      conMermas: store.ordenes.filter((o) => o.mermasKg > 0).length,
      ultimaSincronizacion: `${HOY}T14:03:00`,
    };
    return HttpResponse.json(resumen);
  }),

  http.get(`${API}/ordenes`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const items = filtrar(url).map(enriquecerOrden);
    const page = numeroQuery(url, 'page', 1);
    const pageSize = numeroQuery(url, 'pageSize', 25);
    return HttpResponse.json(paginar(items, page, pageSize));
  }),

  http.get(`${API}/ordenes/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    return HttpResponse.json(enriquecerOrden(orden));
  }),

  http.get(`${API}/ordenes/:id/paradas`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    const data = store.paradas
      .filter((p) => p.ordenId === orden.id)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(enriquecerParada);
    const totalMin = data.reduce((acc, p) => acc + p.duracionMin, 0);
    return HttpResponse.json({
      data,
      resumen: {
        cantidad: data.length,
        minutos: totalMin,
        afectanOee: data.filter((p) => p.afectaOee).length,
      },
    });
  }),

  http.get(`${API}/ordenes/:id/mermas`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    const data = store.mermas
      .filter((m) => m.ordenId === orden.id)
      .sort((a, b) => a.registradaEn.localeCompare(b.registradaEn))
      .map(enriquecerMerma);
    return HttpResponse.json({
      data,
      resumen: { cantidad: data.length, kg: data.reduce((acc, m) => acc + m.cantidadKg, 0) },
    });
  }),

  http.get(`${API}/ordenes/:id/velocidades`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    const data = store.velocidades
      .filter((v) => v.ordenId === orden.id)
      .sort((a, b) => a.registradaEn.localeCompare(b.registradaEn))
      .map(enriquecerVelocidad);
    return HttpResponse.json({ data });
  }),

  http.get(`${API}/ordenes/:id/bitacora`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    const url = new URL(request.url);
    const tipos = listaQuery(url, 'tipo');
    let data = store.bitacora.filter((b) => b.ordenId === orden.id);
    if (tipos.length > 0) data = data.filter((b) => tipos.includes(b.tipo));
    data = [...data].sort((a, b) => b.fecha.localeCompare(a.fecha));
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/ordenes`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;
    const codigo = String(body.codigo ?? '');
    if (store.ordenes.some((o) => o.codigo === codigo)) {
      return errores.conflicto('Ya existe una orden con ese número', { codigo });
    }
    const productoId = String(body.productoId ?? '');
    const lineaId = String(body.lineaId ?? LINEA_POR_DEFECTO);
    const producto = store.productos.find((p) => p.id === productoId);

    /*
     * La velocidad estándar se resuelve del par producto × línea vigente y se
     * congela en u/min: sin par activo la orden no puede iniciarse, porque el
     * OEE quedaría sin referencia de desempeño (espejo de `orders.service.ts`).
     */
    const par = parActivo(productoId, lineaId);
    if (!par) {
      return errores.validacion({
        productoId: 'El producto no tiene velocidad estándar en esta línea',
      });
    }

    const colaboradorIds = (body.colaboradorIds as string[] | undefined) ?? [];
    const orden: OrdenFabricacion = {
      id: `ORD-${codigo.slice(-4)}`,
      codigo,
      fecha: ahoraIso().slice(0, 10),
      lineaId,
      productoId,
      turno: (body.turno as OrdenFabricacion['turno']) ?? TURNO_ACTUAL,
      lote: String(body.lote ?? ''),
      vencimiento: String(body.vencimiento ?? ''),
      planificado: Number(body.planificado ?? 0),
      producido: 0,
      conteoCodificadora: 0,
      velocidadEstandar: par.velocidadUnidMin,
      velocidadEstandarId: par.id,
      estado: 'en_curso',
      maquinistaId: String(body.maquinistaId ?? 'USR-02'),
      supervisorId: String(body.supervisorId ?? 'USR-03'),
      operarios: Number(body.operarios ?? 5),
      colaboradores: colaboradorIds.length
        ? colaboradoresBase.filter((c) => colaboradorIds.includes(c.id))
        : colaboradoresBase.slice(0, 4),
      oee: { oee: 0, disponibilidad: 0, desempeno: 0, calidad: 0 },
      paradasCount: 0,
      mermasKg: 0,
      inicio: ahoraIso(),
      fin: null,
    };
    store.ordenes.unshift(orden);

    const usuario = usuarioDesdeToken(request);
    registrarBitacora({
      ordenId: orden.id,
      fecha: orden.inicio,
      usuario: usuario?.nombre ?? 'Sistema',
      usuarioIniciales: usuario?.iniciales ?? 'SY',
      tipo: 'creacion',
      texto: `${usuario?.nombre ?? 'Sistema'} creó la orden ${orden.codigo}`,
    });

    const linea = store.lineaEstados.find((l) => l.lineaId === orden.lineaId);
    if (linea) {
      linea.estado = 'produciendo';
      linea.orden = {
        id: orden.id,
        codigo: orden.codigo,
        productoNombre: producto?.nombre ?? '—',
        turno: orden.turno,
      };
      linea.plan = orden.planificado;
      linea.producido = 0;
      linea.velocidad = orden.velocidadEstandar;
      linea.velocidadEstandar = orden.velocidadEstandar;
      linea.tiempoEnEstadoMin = 0;
    }

    return HttpResponse.json(enriquecerOrden(orden), { status: 201 });
  }),

  http.post(`${API}/ordenes/:id/finalizar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    if (orden.estado !== 'en_curso') {
      return errores.conflicto('La orden ya fue finalizada', { estado: orden.estado });
    }
    const body = (await request.json()) as Record<string, unknown>;
    orden.producido = Number(body.producido ?? orden.producido);
    orden.conteoCodificadora = Number(body.conteoCodificadora ?? orden.conteoCodificadora);
    orden.fin = ahoraIso();
    orden.estado = 'por_validar';
    if (typeof body.comentario === 'string' && body.comentario) orden.observacion = body.comentario;

    const usuario = usuarioDesdeToken(request);
    registrarBitacora({
      ordenId: orden.id,
      fecha: orden.fin,
      usuario: usuario?.nombre ?? 'Sistema',
      usuarioIniciales: usuario?.iniciales ?? 'SY',
      tipo: 'sistema',
      texto: `${usuario?.nombre ?? 'Sistema'} finalizó la orden con ${orden.producido} unidades (conteo codificadora ${orden.conteoCodificadora})`,
    });

    return HttpResponse.json(enriquecerOrden(orden));
  }),

  http.post(`${API}/ordenes/:id/validar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    if (orden.estado === 'validada') {
      return errores.conflicto('La orden ya está validada', { estado: orden.estado });
    }
    if (orden.estado === 'en_curso') {
      return errores.conflicto('No se puede validar una orden en curso', { estado: orden.estado });
    }
    orden.estado = 'validada';
    recalcularOrden(orden.id);

    const usuario = usuarioDesdeToken(request);
    registrarBitacora({
      ordenId: orden.id,
      fecha: ahoraIso(),
      usuario: usuario?.nombre ?? 'Carlos Mendoza',
      usuarioIniciales: usuario?.iniciales ?? 'CM',
      tipo: 'validacion',
      texto: `${usuario?.nombre ?? 'Carlos Mendoza'} validó y cerró la orden`,
    });
    return HttpResponse.json(enriquecerOrden(orden));
  }),
];
