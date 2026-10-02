import { http, HttpResponse } from 'msw';
import type { RegistroVelocidad } from '@mes/types';
import { ROLES_CAPTURA_VELOCIDAD } from '@mes/types';
import { calcDesvioVelocidad } from '@mes/shared';
import { getStore, parActivo, registrarBitacora, registrarTri } from '../store';
import {
  API,
  ahoraIso,
  errorTiempoRegistro,
  errores,
  listaQuery,
  numeroQuery,
  paginar,
  preludio,
} from './_utils';
import { enriquecerVelocidad } from './_enrich';
import { capturaEnOrden, exigeRoles } from './auth';

export const speedsHandlers = [
  http.get(`${API}/velocidades`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const store = getStore();
    const lineaIds = listaQuery(url, 'lineaId');
    const ordenId = url.searchParams.get('ordenId');
    let items = [...store.velocidades];
    if (ordenId) items = items.filter((v) => v.ordenId === ordenId);
    if (lineaIds.length > 0) items = items.filter((v) => lineaIds.includes(v.lineaId));
    items.sort((a, b) => b.registradaEn.localeCompare(a.registradaEn));
    return HttpResponse.json(
      paginar(items.map(enriquecerVelocidad), numeroQuery(url, 'page', 1), numeroQuery(url, 'pageSize', 25))
    );
  }),

  http.post(`${API}/velocidades`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const { usuario, respuesta } = exigeRoles(request, ROLES_CAPTURA_VELOCIDAD);
    if (respuesta) return respuesta;
    const body = (await request.json()) as Record<string, unknown>;
    const lineaIdBody = body.lineaId === undefined ? undefined : String(body.lineaId);
    if (lineaIdBody !== undefined && !store.lineas.some((l) => l.id === lineaIdBody)) {
      return errores.validacion({ lineaId: 'La línea seleccionada no existe' });
    }
    const orden = store.ordenes.find((o) => o.id === body.ordenId || o.codigo === body.ordenId);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    const accesoOrden = capturaEnOrden(orden, usuario, lineaIdBody);
    if (accesoOrden) return accesoOrden;
    const tiempoInvalido = errorTiempoRegistro(body);
    if (tiempoInvalido) return tiempoInvalido;
    const velocidadReal = Number(body.velocidadReal ?? 0);
    if (!(velocidadReal > 0)) {
      return errores.validacion({ velocidadReal: 'La velocidad debe ser mayor que 0' });
    }
    if (velocidadReal > 1000) {
      return errores.validacion({ velocidadReal: 'Velocidad fuera de rango' });
    }

    /* Estándar congelado en la orden; si faltara, el par producto × línea. */
    const velocidadEstandar =
      orden.velocidadEstandar || (parActivo(orden.productoId, orden.lineaId)?.velocidadUnidMin ?? 0);

    const registro: RegistroVelocidad = {
      id: `VEL-${orden.id.slice(4)}-N${store.velocidades.length + 1}`,
      ordenId: orden.id,
      lineaId: String(body.lineaId ?? orden.lineaId),
      registradaEn: ahoraIso(),
      velocidadReal,
      velocidadEstandar,
      desvioPct: calcDesvioVelocidad(velocidadReal, velocidadEstandar),
      motivo: body.motivo ? String(body.motivo) : undefined,
      responsableId: String(body.responsableId ?? 'USR-02'),
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
    };
    store.velocidades.unshift(registro);
    registrarTri(`Velocidad ${registro.velocidadReal} u/min`, registro.tiempoRegistroSeg, registro.registradaEn.slice(0, 10), registro.id);

    const linea = store.lineaEstados.find((l) => l.lineaId === registro.lineaId);
    if (linea && linea.estado === 'produciendo') linea.velocidad = registro.velocidadReal;

    registrarBitacora({
      ordenId: registro.ordenId,
      fecha: registro.registradaEn,
      usuario: usuario.nombre,
      usuarioIniciales: usuario.iniciales,
      tipo: 'velocidad',
      texto: `${usuario.nombre} registró velocidad real ${registro.velocidadReal} u/min (estándar ${velocidadEstandar} · ${registro.desvioPct} %)`,
    });

    return HttpResponse.json(enriquecerVelocidad(registro), { status: 201 });
  }),
];
