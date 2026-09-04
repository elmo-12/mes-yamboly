import { http, HttpResponse } from 'msw';
import type { Merma, TipoMermaCodigo } from '@mes/types';
import {
  buscarCausaMerma,
  cadenaCausaMerma,
  getStore,
  recalcularOrden,
  registrarBitacora,
  registrarTri,
} from '../store';
import { API, ahoraIso, errores, listaQuery, numeroQuery, paginar, preludio } from './_utils';
import { enriquecerMerma } from './_enrich';
import { usuarioDesdeToken } from './auth';

interface JerarquiaMerma {
  causaId: string;
  tipoCausaId: string;
  clasificacionId: string | null;
}

/**
 * Valida el árbol de causas de merma: la causa elegida debe ser una **hoja
 * activa** (`nivel: 'causa'`) y su cadena de padres debe coincidir con la
 * clasificación y el tipo enviados (si no vienen, se derivan de la hoja).
 * Además exige `observacion` / `numeroSolicitud` cuando la causa lo marca.
 * Espejo de `ScrapService.validarCausa`.
 */
function validarCausa(entrada: {
  causaId: string;
  tipo: TipoMermaCodigo;
  tipoCausaId?: string;
  clasificacionId?: string | null;
  observacion?: string;
  numeroSolicitud?: string;
}): { jerarquia?: JerarquiaMerma; error?: Response } {
  const causa = buscarCausaMerma(entrada.causaId);
  if (!causa) {
    return { error: errores.validacion({ causaId: 'La causa seleccionada no existe' }) };
  }
  if (causa.nivel !== 'causa') {
    return {
      error: errores.validacion({
        causaId: `${causa.codigo} es un nivel «${causa.nivel}»: elige una causa final del árbol`,
      }),
    };
  }
  if (causa.estado !== 'activo') {
    return {
      error: errores.validacion({ causaId: `La causa ${causa.codigo} está dada de baja` }),
    };
  }
  if (causa.aplicaA.length > 0 && !causa.aplicaA.includes(entrada.tipo)) {
    return {
      error: errores.validacion({
        causaId: `La causa ${causa.codigo} no aplica a mermas de tipo ${entrada.tipo}`,
      }),
    };
  }

  const cadena = cadenaCausaMerma(causa.id);
  const tipoCausaId = cadena.tipo?.id ?? '';
  const clasificacionId = cadena.clasificacion?.id ?? null;

  if (entrada.tipoCausaId && entrada.tipoCausaId !== tipoCausaId) {
    return {
      error: errores.validacion({
        tipoCausaId: `La causa ${causa.codigo} no pertenece al tipo de producción seleccionado`,
      }),
    };
  }
  if (entrada.clasificacionId && entrada.clasificacionId !== clasificacionId) {
    return {
      error: errores.validacion({
        clasificacionId: `La causa ${causa.codigo} no pertenece a la clasificación seleccionada`,
      }),
    };
  }
  if (causa.requiereComentario && !entrada.observacion?.trim()) {
    return {
      error: errores.validacion({ observacion: `La causa ${causa.codigo} exige un comentario` }),
    };
  }
  if (causa.requiereSolicitud && !entrada.numeroSolicitud?.trim()) {
    return {
      error: errores.validacion({
        numeroSolicitud: `La causa ${causa.codigo} exige un n.º de solicitud`,
      }),
    };
  }

  return { jerarquia: { causaId: causa.id, tipoCausaId, clasificacionId } };
}

function opcional(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

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
    const tipo = (body.tipo as Merma['tipo']) ?? 'EP';
    const { jerarquia, error: invalida } = validarCausa({
      causaId: String(body.causaId ?? ''),
      tipo,
      tipoCausaId: opcional(body.tipoCausaId),
      clasificacionId: (body.clasificacionId as string | null | undefined) ?? null,
      observacion: opcional(body.observacion),
      numeroSolicitud: opcional(body.numeroSolicitud),
    });
    if (invalida) return invalida;
    const causa = buscarCausaMerma(jerarquia!.causaId)!;

    const ordenId = String(body.ordenId ?? '');
    const merma: Merma = {
      id: `MER-${ordenId.slice(4)}-N${store.mermas.length + 1}`,
      ordenId,
      lineaId: String(body.lineaId ?? ''),
      tipo,
      cantidadKg,
      sabor: String(body.sabor ?? 'Vainilla'),
      tipoCausaId: jerarquia!.tipoCausaId,
      clasificacionId: jerarquia!.clasificacionId,
      causaId: jerarquia!.causaId,
      numeroSolicitud: opcional(body.numeroSolicitud) ?? null,
      responsableId: String(body.responsableId ?? 'USR-04'),
      codigoBalde: opcional(body.codigoBalde),
      enviarPasteurizacion: Boolean(body.enviarPasteurizacion),
      registradaEn: ahoraIso(),
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
      observacion: opcional(body.observacion),
    };
    store.mermas.unshift(merma);
    recalcularOrden(merma.ordenId);
    registrarTri(`Merma ${merma.tipo} ${merma.cantidadKg} kg`, merma.tiempoRegistroSeg, merma.registradaEn.slice(0, 10), merma.id);

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
    const body = (await request.json()) as Partial<Merma>;

    if (body.cantidadKg !== undefined && body.cantidadKg <= 0) {
      return errores.validacion({ cantidadKg: 'La cantidad debe ser mayor que 0' });
    }

    /* Al reclasificar se revalida el árbol completo con los valores resultantes. */
    let jerarquia: JerarquiaMerma | undefined;
    if (body.causaId) {
      const resultado = validarCausa({
        causaId: body.causaId,
        tipo: body.tipo ?? merma.tipo,
        tipoCausaId: opcional(body.tipoCausaId),
        clasificacionId: body.clasificacionId ?? null,
        observacion: opcional(body.observacion) ?? merma.observacion,
        numeroSolicitud: opcional(body.numeroSolicitud) ?? merma.numeroSolicitud ?? undefined,
      });
      if (resultado.error) return resultado.error;
      jerarquia = resultado.jerarquia;
    }

    Object.assign(merma, {
      ...body,
      codigoBalde: body.codigoBalde ?? merma.codigoBalde,
      observacion: body.observacion ?? merma.observacion,
      numeroSolicitud: body.numeroSolicitud ?? merma.numeroSolicitud,
    });
    if (jerarquia) {
      merma.causaId = jerarquia.causaId;
      merma.tipoCausaId = jerarquia.tipoCausaId;
      merma.clasificacionId = jerarquia.clasificacionId;
    }
    recalcularOrden(merma.ordenId);
    return HttpResponse.json(enriquecerMerma(merma));
  }),
];
