import { http, HttpResponse } from 'msw';
import type { OrdenFabricacion, OrdenListItem, OrdenesResumen, Periodo, Turno } from '@mes/types';
import {
  ROLES_FINALIZAR_ORDEN,
  ROLES_INICIAR_ORDEN,
  ROLES_VALIDAR_ORDEN,
  esFechaReal,
} from '@mes/types';
import {
  MARGEN_PLAUSIBILIDAD_PRODUCCION,
  minutosEntreLocal,
  produccionMaximaPlausible,
  rangoPeriodo,
} from '@mes/shared';
import {
  HOY,
  TOTAL_HISTORICO_ORDENES,
  colaboradoresBase,
  productoPorId,
} from '../data';
import { getStore, recalcularOrden, registrarBitacora, registrarTri } from '../store';
import {
  API,
  ahoraIso,
  error,
  errorTiempoRegistro,
  errores,
  listaQuery,
  normalizar,
  numeroQuery,
  paginar,
  preludio,
} from './_utils';
import {
  enriquecerMerma,
  enriquecerOrden,
  enriquecerParada,
  enriquecerVelocidad,
  velocidadDeOrdenSap,
} from './_enrich';
import { accesoLinea, exigeRoles } from './auth';

/** 404 con el mensaje de la API (`Orden de fabricación no encontrada`). */
function noEncontrada(recurso: string): Response {
  return error(404, 'NOT_FOUND', `${recurso} no encontrada`);
}

/** Roles que pueden figurar como supervisor de la orden (espejo de `ROLES_CORRECCION`). */
const ROLES_SUPERVISAN = new Set(['jefe', 'supervisor']);

/** Detalle con el plan SAP del que nació la orden (espejo de `OrdersService.detalle`). */
function detalleOrden(orden: OrdenFabricacion): OrdenListItem {
  const sap = getStore().ordenesSap.find((o) => o.ordenId === orden.id);
  return {
    ...enriquecerOrden(orden),
    planSap: sap
      ? {
          ordenSapId: sap.id,
          numero: sap.numero,
          fecha: sap.fecha,
          turno: sap.turno,
          planificadoCajas: sap.planificadoCajas,
        }
      : null,
  };
}

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
      /* Última sincronización real con SAP: máximo `sincronizadaEn` de las filas SAP. */
      ultimaSincronizacion:
        store.ordenesSap.reduce<string | null>(
          (max, o) => (max === null || o.sincronizadaEn > max ? o.sincronizadaEn : max),
          null
        ),
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
    if (!orden) return noEncontrada('Orden de fabricación');
    return HttpResponse.json(detalleOrden(orden));
  }),

  http.get(`${API}/ordenes/:id/paradas`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return noEncontrada('Orden de fabricación');
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
    if (!orden) return noEncontrada('Orden de fabricación');
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
    if (!orden) return noEncontrada('Orden de fabricación');
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
    if (!orden) return noEncontrada('Orden de fabricación');
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
    const { usuario, respuesta } = exigeRoles(request, ROLES_INICIAR_ORDEN);
    if (respuesta) return respuesta;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;
    const tiempoInvalido = errorTiempoRegistro(body);
    if (tiempoInvalido) return tiempoInvalido;

    /*
     * Alta desde una orden SAP pendiente (espejo de `OrdersService.crear`):
     * línea, producto, turno, número y planificado salen de la fila SAP; la
     * velocidad, del par activo o, en su defecto, del texto SAP.
     */
    const ordenSapId = String(body.ordenSapId ?? '');
    if (!ordenSapId) return errores.validacion({ ordenSapId: 'Selecciona una orden SAP' });
    const sap = store.ordenesSap.find((o) => o.id === ordenSapId);
    if (!sap) return noEncontrada('Orden SAP');
    if (sap.ordenId) {
      return errores.conflicto('La orden SAP ya fue iniciada', { ordenSapId, ordenId: sap.ordenId });
    }
    const producto = sap.productoId ? store.productos.find((p) => p.id === sap.productoId) : undefined;
    if (!producto) {
      return errores.validacion({
        ordenSapId: `El producto ${sap.codigoProducto || '—'} no existe en el maestro del MES`,
      });
    }
    const velocidad = velocidadDeOrdenSap(sap);
    if (!velocidad) {
      return errores.validacion({
        ordenSapId: 'El producto no tiene velocidad estándar en esta línea ni en la orden SAP',
      });
    }

    const lineaSap = store.lineas.find((l) => l.id === sap.lineaId);
    if (lineaSap && lineaSap.estado !== 'activo') {
      return errores.validacion({
        ordenSapId: `La línea ${lineaSap.codigo} está desactivada: no se pueden iniciar órdenes en ella`,
      });
    }

    /* Validaciones de negocio del formulario (422 por campo, como la API). */
    const detalles: Record<string, string> = {};
    const lote = String(body.lote ?? '').trim();
    if (lote.length < 3) detalles.lote = 'El lote es obligatorio (mínimo 3 caracteres)';
    const vencimiento = String(body.vencimiento ?? '');
    if (!esFechaReal(vencimiento)) detalles.vencimiento = 'Fecha inválida';
    else if (vencimiento <= ahoraIso().slice(0, 10)) {
      detalles.vencimiento = 'El vencimiento debe ser posterior a hoy';
    }
    const maquinista = store.usuarios.find((u) => u.id === body.maquinistaId);
    if (!maquinista) detalles.maquinistaId = 'El maquinista indicado no existe';
    else if (maquinista.rol !== 'maquinista') {
      detalles.maquinistaId = `${maquinista.nombre} no tiene rol de maquinista`;
    } else if (!maquinista.activo) detalles.maquinistaId = `${maquinista.nombre} está desactivado`;
    const supervisor = store.usuarios.find((u) => u.id === body.supervisorId);
    if (!supervisor) detalles.supervisorId = 'El supervisor indicado no existe';
    else if (!ROLES_SUPERVISAN.has(supervisor.rol)) {
      detalles.supervisorId = `${supervisor.nombre} no es supervisor ni jefe de producción`;
    } else if (!supervisor.activo) detalles.supervisorId = `${supervisor.nombre} está desactivado`;
    const operarios = Number(body.operarios);
    if (!Number.isInteger(operarios) || operarios < 1) {
      detalles.operarios = 'Debe haber al menos 1 operario';
    }
    const colaboradorIdsPedidos = [...new Set((body.colaboradorIds as string[] | undefined) ?? [])];
    const desconocidos = colaboradorIdsPedidos.filter(
      (id) => !colaboradoresBase.some((c) => c.id === id)
    );
    if (desconocidos.length > 0) {
      detalles.colaboradorIds = `Colaboradores inexistentes: ${desconocidos.join(', ')}`;
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    /* Una sola orden en curso por línea (espejo de `OrdersService.crear`). */
    const abierta = store.ordenes.find((o) => o.lineaId === sap.lineaId && o.estado === 'en_curso');
    if (abierta) {
      return errores.conflicto(
        `La línea ${lineaSap?.codigo ?? sap.lineaId} ya tiene la orden ${abierta.codigo} en curso: ` +
          'finalízala antes de iniciar otra',
        { lineaId: sap.lineaId, ordenId: abierta.id },
      );
    }

    /* Mismo esquema de código que `pnpm sync:real`: número SAP, y `-2`, `-3`… si se repite. */
    let codigo = sap.numero;
    for (let jornada = 2; store.ordenes.some((o) => o.codigo === codigo); jornada += 1) {
      codigo = `${sap.numero}-${jornada}`;
    }
    const lineaId = sap.lineaId;
    const unidadesPorCaja = producto.unidadesPorCaja > 0 ? producto.unidadesPorCaja : 1;

    const colaboradorIds = colaboradorIdsPedidos;
    const orden: OrdenFabricacion = {
      id: `ORD-${codigo}`,
      codigo,
      fecha: ahoraIso().slice(0, 10),
      lineaId,
      productoId: producto.id,
      /* Turno de la hora real de inicio; el del plan SAP queda en `planSap`. */
      turno: Number(ahoraIso().slice(11, 13)) >= 6 && Number(ahoraIso().slice(11, 13)) < 18 ? 'D' : 'N',
      lote,
      vencimiento,
      /* SAP planifica en cajas; el MES guarda unidades. */
      planificado: sap.planificadoCajas * unidadesPorCaja,
      producido: 0,
      conteoCodificadora: 0,
      velocidadEstandar: velocidad.velocidadUnidMin,
      velocidadEstandarId: velocidad.velocidadEstandarId,
      estado: 'en_curso',
      maquinistaId: maquinista!.id,
      supervisorId: supervisor!.id,
      operarios,
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
    sap.ordenId = orden.id;

    registrarBitacora({
      ordenId: orden.id,
      fecha: orden.inicio,
      usuario: usuario.nombre,
      usuarioIniciales: usuario.iniciales,
      tipo: 'creacion',
      texto:
        `${usuario.nombre} creó la orden ${orden.codigo} desde la orden SAP ${sap.numero} ` +
        `(${sap.fecha} · turno ${sap.turno}) · ${producto.nombre} · ` +
        `${sap.planificadoCajas} cajas = ${orden.planificado} unidades`,
    });

    const linea = store.lineaEstados.find((l) => l.lineaId === orden.lineaId);
    if (linea) {
      linea.estado = 'produciendo';
      linea.orden = {
        id: orden.id,
        codigo: orden.codigo,
        productoNombre: producto.nombre,
        turno: orden.turno,
      };
      linea.plan = orden.planificado;
      linea.producido = 0;
      linea.velocidad = orden.velocidadEstandar;
      linea.velocidadEstandar = orden.velocidadEstandar;
      linea.tiempoEnEstadoMin = 0;
    }

    /* El alta de la orden también cronometra el TRI (espejo de `OrdersService.crear`). */
    registrarTri(
      `Inicio de ${orden.codigo}`,
      Number(body.tiempoRegistroSeg ?? 0),
      orden.fecha,
      `${orden.id}-inicio`
    );

    return HttpResponse.json(detalleOrden(orden), { status: 201 });
  }),

  http.post(`${API}/ordenes/:id/finalizar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const { usuario, respuesta } = exigeRoles(request, ROLES_FINALIZAR_ORDEN);
    if (respuesta) return respuesta;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return noEncontrada('Orden de fabricación');
    /* El maquinista sólo cierra órdenes de su línea (403). */
    const sinAcceso = accesoLinea(usuario, orden.lineaId);
    if (sinAcceso) return sinAcceso;
    if (orden.estado !== 'en_curso') {
      return errores.conflicto('La orden ya fue finalizada', { estado: orden.estado });
    }
    const abierta = store.paradas.find((p) => p.ordenId === orden.id && p.fin === null);
    if (abierta) {
      return errores.conflicto('Cierra la parada abierta antes de finalizar', { paradaId: abierta.id });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const tiempoInvalido = errorTiempoRegistro(body);
    if (tiempoInvalido) return tiempoInvalido;
    const detalles: Record<string, string> = {};
    for (const campo of ['producido', 'conteoCodificadora'] as const) {
      const valor = body[campo];
      if (valor === '' || valor === null || valor === undefined) detalles[campo] = 'Campo obligatorio';
      else if (!Number.isInteger(Number(valor))) detalles[campo] = 'Debe ser un número entero';
      else if (Number(valor) < 0) detalles[campo] = 'Debe ser 0 o mayor';
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);
    /* 422 si supera lo físicamente posible (espejo de `OrdersService.finalizar`). */
    const duracionMin = minutosEntreLocal(orden.inicio, ahoraIso());
    if (orden.velocidadEstandar > 0) {
      const maximo = produccionMaximaPlausible(orden.velocidadEstandar, duracionMin);
      if (Number(body.producido) > maximo) {
        return errores.validacion({
          producido:
            `${Number(body.producido)} u no es posible en ${Math.round(duracionMin)} min a ` +
            `${orden.velocidadEstandar} u/min (máximo ${maximo} u con un margen de ` +
            `×${MARGEN_PLAUSIBILIDAD_PRODUCCION})`,
        });
      }
    }
    if (typeof body.evidenciaUrl === 'string' && body.evidenciaUrl) orden.evidenciaUrl = body.evidenciaUrl;
    orden.producido = Number(body.producido ?? orden.producido);
    orden.conteoCodificadora = Number(body.conteoCodificadora ?? orden.conteoCodificadora);
    orden.fin = ahoraIso();
    orden.estado = 'por_validar';
    if (typeof body.comentario === 'string' && body.comentario) orden.observacion = body.comentario;

    registrarBitacora({
      ordenId: orden.id,
      fecha: orden.fin,
      usuario: usuario.nombre,
      usuarioIniciales: usuario.iniciales,
      tipo: 'sistema',
      texto: `${usuario.nombre} finalizó la orden con ${orden.producido} unidades (conteo codificadora ${orden.conteoCodificadora})`,
    });

    /* Espejo de `OrdersService.finalizar`: el cierre alimenta el postest del TRI. */
    registrarTri(
      `Cierre de ${orden.codigo}`,
      Number(body.tiempoRegistroSeg ?? 0),
      orden.fin.slice(0, 10),
      `${orden.id}-cierre`
    );

    return HttpResponse.json(detalleOrden(orden));
  }),

  http.post(`${API}/ordenes/:id/validar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const { usuario, respuesta } = exigeRoles(request, ROLES_VALIDAR_ORDEN);
    if (respuesta) return respuesta;
    const store = getStore();
    const orden = store.ordenes.find((o) => o.id === params.id || o.codigo === params.id);
    if (!orden) return noEncontrada('Orden de fabricación');
    if (orden.estado === 'validada') {
      return errores.conflicto('La orden ya está validada', { estado: orden.estado });
    }
    if (orden.estado === 'en_curso') {
      return errores.conflicto('No se puede validar una orden en curso', { estado: orden.estado });
    }
    const abierta = store.paradas.find((p) => p.ordenId === orden.id && p.fin === null);
    if (abierta) {
      return errores.conflicto('Cierra la parada abierta antes de validar', { paradaId: abierta.id });
    }
    orden.estado = 'validada';
    recalcularOrden(orden.id);

    registrarBitacora({
      ordenId: orden.id,
      fecha: ahoraIso(),
      usuario: usuario.nombre,
      usuarioIniciales: usuario.iniciales,
      tipo: 'validacion',
      texto: `${usuario.nombre} validó y cerró la orden`,
    });
    return HttpResponse.json(detalleOrden(orden));
  }),
];
