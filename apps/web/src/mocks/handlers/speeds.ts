import { http, HttpResponse } from 'msw';
import type { RegistroVelocidad } from '@mes/types';
import { calcDesvioVelocidad } from '@mes/shared';
import { getStore, nextId, registrarBitacora, registrarTri } from '../store';
import { API, ahoraIso, errores, listaQuery, numeroQuery, paginar, preludio } from './_utils';
import { enriquecerVelocidad } from './_enrich';
import { usuarioDesdeToken } from './auth';

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
    const body = (await request.json()) as Record<string, unknown>;
    const velocidadReal = Number(body.velocidadReal ?? 0);
    if (!(velocidadReal > 0)) {
      return errores.validacion({ velocidadReal: 'La velocidad debe ser mayor que 0' });
    }
    const orden = store.ordenes.find((o) => o.id === body.ordenId);
    const velocidadEstandar = orden?.velocidadEstandar ?? 120;

    const registro: RegistroVelocidad = {
      id: nextId('VEL'),
      ordenId: String(body.ordenId ?? ''),
      lineaId: String(body.lineaId ?? orden?.lineaId ?? ''),
      registradaEn: ahoraIso(),
      velocidadReal,
      velocidadEstandar,
      desvioPct: calcDesvioVelocidad(velocidadReal, velocidadEstandar),
      motivo: body.motivo ? String(body.motivo) : undefined,
      responsableId: String(body.responsableId ?? 'USR-02'),
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
    };
    store.velocidades.unshift(registro);
    registrarTri(`Velocidad ${registro.velocidadReal} u/min`, registro.tiempoRegistroSeg, registro.registradaEn.slice(0, 10));

    const linea = store.lineaEstados.find((l) => l.lineaId === registro.lineaId);
    if (linea && linea.estado === 'produciendo') linea.velocidad = registro.velocidadReal;

    const usuario = usuarioDesdeToken(request);
    registrarBitacora({
      ordenId: registro.ordenId,
      fecha: registro.registradaEn,
      usuario: usuario?.nombre ?? 'Jorge Quispe',
      usuarioIniciales: usuario?.iniciales ?? 'JQ',
      tipo: 'velocidad',
      texto: `${usuario?.nombre ?? 'Jorge Quispe'} registró velocidad real ${registro.velocidadReal} u/min (estándar ${velocidadEstandar})`,
    });

    return HttpResponse.json(enriquecerVelocidad(registro), { status: 201 });
  }),
];
