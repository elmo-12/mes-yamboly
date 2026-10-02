import { http, HttpResponse } from 'msw';
import type { CausaParada, Parada } from '@mes/types';
import { ROLES_CAPTURA_PARADA } from '@mes/types';
import { minutosEntre } from '@mes/shared';
import {
  getStore,
  nextId,
  recalcularOrden,
  registrarBitacora,
  registrarTri,
  sincronizarTiempoReal,
} from '../store';
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
import { enriquecerParada } from './_enrich';
import { accesoLinea, capturaEnOrden, exigeRoles } from './auth';

function textoCausa(causaId: string): string {
  const causa = getStore().causasParada.find((c) => c.id === causaId);
  return causa ? `${causa.codigo} ${causa.nombre}` : 'parada';
}

/** `14:05` de un ISO local. */
function hhmm(iso: string | null): string {
  return iso ? iso.slice(11, 16) : '—';
}

/**
 * Espejo de `DowntimesService.validarCausa`: la causa debe ser una hoja
 * (`especifica`) activa, aplicable a la línea y del tipo enviado.
 */
function validarCausa(
  causaId: string,
  lineaId: string,
  tipoCausaId?: string
): { causa: CausaParada; tipoId: string } | Response {
  const store = getStore();
  const causa = store.causasParada.find((c) => c.id === causaId);
  if (!causa) return errores.validacion({ causaId: 'La causa seleccionada no existe' });
  if (causa.nivel !== 'especifica') {
    return errores.validacion({
      causaId: `${causa.codigo} es un nivel «${causa.nivel}»: elige una causa específica del árbol`,
    });
  }
  if (causa.estado === 'inactivo') return errores.validacion({ causaId: 'La causa está dada de baja' });
  if (causa.lineasAplicables.length > 0 && !causa.lineasAplicables.includes(lineaId)) {
    return errores.validacion({ causaId: `La causa ${causa.codigo} no aplica a esta línea` });
  }
  /* El tipo es la raíz del árbol (específica → general → tipo). */
  let tipo: CausaParada | undefined = causa;
  while (tipo?.parentId) tipo = store.causasParada.find((c) => c.id === tipo!.parentId);
  const tipoId = tipo?.id ?? causa.id;
  if (tipoCausaId && tipoCausaId !== tipoId) {
    return errores.validacion({
      tipoCausaId: `La causa ${causa.codigo} no pertenece al tipo de parada seleccionado`,
    });
  }
  return { causa, tipoId };
}

/** Espejo de `validarRequisitos`: solicitud y foto obligatorias según la causa. */
function validarRequisitos(
  causa: CausaParada,
  numeroSolicitud: string | undefined,
  evidenciaUrl: string | undefined
): Response | null {
  if (causa.requiereSolicitud && !numeroSolicitud?.trim()) {
    return errores.validacion({
      numeroSolicitud: `La causa ${causa.codigo} exige el número de solicitud de mantenimiento`,
    });
  }
  if (causa.requiereEvidencia && !evidenciaUrl) {
    return errores.validacion({ evidenciaUrl: `La causa ${causa.codigo} exige una foto de evidencia` });
  }
  return null;
}

/** Espejo de `validarSolapes`: una sola parada abierta por línea y sin solapes. */
function conflictoSolape(
  lineaId: string,
  inicio: string,
  fin: string | null,
  excluirId?: string
): Response | null {
  const paradas = getStore().paradas.filter((p) => p.lineaId === lineaId && p.id !== excluirId);
  if (fin === null) {
    const abierta = paradas.find((p) => p.fin === null);
    if (abierta) {
      return errores.conflicto(
        `La línea ya tiene una parada abierta desde las ${hhmm(abierta.inicio)}: ciérrala antes de registrar otra`,
        { paradaAbiertaId: abierta.id }
      );
    }
  }
  const solapada = paradas.find((p) => p.fin !== null && p.fin > inicio && (!fin || p.inicio < fin));
  if (solapada) {
    return errores.conflicto(
      `Se solapa con la parada ${hhmm(solapada.inicio)}–${hhmm(solapada.fin)} de la misma línea`,
      { paradaId: solapada.id }
    );
  }
  if (fin !== null || excluirId) {
    const abiertaAntes = paradas.find((p) => p.fin === null && p.inicio < (fin ?? inicio));
    if (abiertaAntes) {
      return errores.conflicto(
        `Se solapa con la parada abierta desde las ${hhmm(abiertaAntes.inicio)} de la misma línea`,
        { paradaId: abiertaAntes.id }
      );
    }
  }
  return null;
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
    const { usuario, respuesta } = exigeRoles(request, ROLES_CAPTURA_PARADA);
    if (respuesta) return respuesta;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;
    const lineaId = String(body.lineaId ?? '');
    if (!store.lineas.some((l) => l.id === lineaId)) {
      return errores.validacion({ lineaId: 'La línea seleccionada no existe' });
    }
    const orden = store.ordenes.find((o) => o.id === body.ordenId || o.codigo === body.ordenId);
    if (!orden) return errores.noEncontrado('Orden de fabricación');
    const accesoOrden = capturaEnOrden(orden, usuario, lineaId);
    if (accesoOrden) return accesoOrden;
    const tiempoInvalido = errorTiempoRegistro(body);
    if (tiempoInvalido) return tiempoInvalido;

    const accionTomada = String(body.accionTomada ?? '').trim();
    if (accionTomada.length < 10) {
      return errores.validacion({ accionTomada: 'Describe la acción tomada (mínimo 10 caracteres)' });
    }
    const validada = validarCausa(
      String(body.causaId ?? ''),
      lineaId,
      body.tipoCausaId ? String(body.tipoCausaId) : undefined
    );
    if (validada instanceof Response) return validada;
    const { causa, tipoId } = validada;
    const causaId = causa.id;
    const numeroSolicitud = body.numeroSolicitud ? String(body.numeroSolicitud).trim() : undefined;
    const evidenciaUrl = body.evidenciaUrl ? String(body.evidenciaUrl) : undefined;
    const requisitos = validarRequisitos(causa, numeroSolicitud, evidenciaUrl);
    if (requisitos) return requisitos;

    const inicio = String(body.inicio ?? ahoraIso());
    const fin = typeof body.fin === 'string' && body.fin ? body.fin : null;
    if (inicio < orden.inicio) {
      return errores.validacion({
        inicio: `La parada no puede empezar antes del inicio de la orden (${orden.inicio.slice(0, 16).replace('T', ' ')})`,
      });
    }
    if (fin && fin < inicio) {
      return errores.validacion({ fin: 'La hora de fin debe ser posterior o igual a la de inicio' });
    }
    const solape = conflictoSolape(lineaId, inicio, fin);
    if (solape) return solape;

    const deteccion = body.deteccionId
      ? store.detecciones.find((d) => d.id === body.deteccionId)
      : undefined;
    if (body.deteccionId) {
      if (!deteccion) return errores.validacion({ deteccionId: 'La detección IoT indicada no existe' });
      if (deteccion.lineaId !== lineaId) {
        return errores.validacion({ deteccionId: 'La detección IoT es de otra línea' });
      }
      if (deteccion.estado !== 'sugerida') {
        return errores.conflicto('La detección ya fue procesada', { estado: deteccion.estado });
      }
    }

    const parada: Parada = {
      id: nextId('PAR'),
      ordenId: orden.id,
      lineaId,
      causaId,
      tipoCausaId: tipoId,
      inicio,
      fin,
      duracionMin: fin ? minutosEntre(inicio, fin) : 0,
      accionTomada,
      numeroSolicitud,
      evidenciaUrl,
      afectaOee: body.afectaOee === undefined ? causa.afectaOee : Boolean(body.afectaOee),
      responsableId: String(body.responsableId ?? 'USR-02'),
      origen: deteccion ? 'iot' : ((body.origen as Parada['origen']) ?? 'manual'),
      deteccionId: deteccion?.id,
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
    };
    store.paradas.unshift(parada);
    if (deteccion) {
      deteccion.estado = 'confirmada';
      deteccion.paradaId = parada.id;
    }
    recalcularOrden(parada.ordenId);
    sincronizarTiempoReal(parada);
    registrarTri(`Parada ${textoCausa(causaId)}`, parada.tiempoRegistroSeg, parada.inicio.slice(0, 10), parada.id);

    registrarBitacora({
      ordenId: parada.ordenId,
      fecha: parada.inicio,
      usuario: usuario.nombre,
      usuarioIniciales: usuario.iniciales,
      tipo: 'parada',
      texto: `${usuario.nombre} registró la parada ${parada.inicio.slice(11, 16)} ${textoCausa(causaId)}`,
    });

    return HttpResponse.json(enriquecerParada(parada), { status: 201 });
  }),

  http.patch(`${API}/paradas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const { usuario, respuesta } = exigeRoles(request, ROLES_CAPTURA_PARADA);
    if (respuesta) return respuesta;
    const parada = store.paradas.find((p) => p.id === params.id);
    if (!parada) return errores.noEncontrado('Parada');
    const orden = store.ordenes.find((o) => o.id === parada.ordenId);
    if (orden) {
      const accesoOrden = capturaEnOrden(orden, usuario);
      if (accesoOrden) return accesoOrden;
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (
      (body.ordenId !== undefined && body.ordenId !== parada.ordenId) ||
      (body.lineaId !== undefined && body.lineaId !== parada.lineaId)
    ) {
      return errores.validacion({
        [body.ordenId !== undefined && body.ordenId !== parada.ordenId ? 'ordenId' : 'lineaId']:
          'Una parada no se puede mover a otra orden ni a otra línea',
      });
    }
    const tiempoInvalido = errorTiempoRegistro(body);
    if (tiempoInvalido) return tiempoInvalido;
    if (body.causaId && body.causaId !== parada.causaId) {
      const validada = validarCausa(
        String(body.causaId),
        parada.lineaId,
        body.tipoCausaId ? String(body.tipoCausaId) : undefined
      );
      if (validada instanceof Response) return validada;
      body.tipoCausaId = validada.tipoId;
    }
    const inicio = typeof body.inicio === 'string' ? body.inicio : parada.inicio;
    const fin = body.fin === undefined ? parada.fin : ((body.fin as string | null) ?? null);
    if (fin && fin < inicio) {
      return errores.validacion({ fin: 'La hora de fin debe ser posterior o igual a la de inicio' });
    }
    if (inicio !== parada.inicio || fin !== parada.fin) {
      const solape = conflictoSolape(parada.lineaId, inicio, fin, parada.id);
      if (solape) return solape;
    }
    const causaAnterior = parada.causaId;
    const { motivoEdicion: _motivo, ...cambios } = body;
    Object.assign(parada, cambios);
    if (parada.fin) parada.duracionMin = minutosEntre(parada.inicio, parada.fin);
    recalcularOrden(parada.ordenId);

    if (body.causaId && body.causaId !== causaAnterior) {
      registrarBitacora({
        ordenId: parada.ordenId,
        fecha: ahoraIso(),
        usuario: usuario.nombre,
        usuarioIniciales: usuario.iniciales,
        tipo: 'edicion',
        texto: `${usuario.nombre} editó la causa de la parada ${parada.inicio.slice(11, 16)}: ${textoCausa(causaAnterior)} → ${textoCausa(parada.causaId)}`,
      });
    }
    return HttpResponse.json(enriquecerParada(parada));
  }),

  http.post(`${API}/paradas/:id/finalizar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const { usuario, respuesta } = exigeRoles(request, ROLES_CAPTURA_PARADA);
    if (respuesta) return respuesta;
    const parada = store.paradas.find((p) => p.id === params.id);
    if (!parada) return errores.noEncontrado('Parada');
    if (parada.fin) return errores.conflicto('La parada ya fue finalizada', { fin: parada.fin });
    const orden = store.ordenes.find((o) => o.id === parada.ordenId);
    if (orden) {
      const accesoOrden = capturaEnOrden(orden, usuario);
      if (accesoOrden) return accesoOrden;
    }
    const body = (await request.json()) as Record<string, unknown>;
    const fin = String(body.fin ?? ahoraIso());
    if (fin < parada.inicio) {
      return errores.validacion({ fin: 'La hora de fin debe ser posterior o igual a la de inicio' });
    }
    parada.fin = fin;
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
    const { usuario, respuesta } = exigeRoles(request, ROLES_CAPTURA_PARADA);
    if (respuesta) return respuesta;
    const deteccion = store.detecciones.find((d) => d.id === params.id);
    if (!deteccion) return errores.noEncontrado('Detección IoT');
    if (deteccion.estado !== 'sugerida') {
      return errores.conflicto('La detección ya fue procesada', { estado: deteccion.estado });
    }
    const sinAcceso = accesoLinea(usuario, deteccion.lineaId);
    if (sinAcceso) return sinAcceso;
    const ordenLinea = store.ordenes.find(
      (o) => o.lineaId === deteccion.lineaId && o.estado === 'en_curso'
    );
    if (!ordenLinea) {
      return errores.validacion({
        lineaId: 'La línea no tiene una orden en curso a la que vincular la parada',
      });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const tiempoInvalido = errorTiempoRegistro(body);
    if (tiempoInvalido) return tiempoInvalido;
    const accionTomada = String(body.accionTomada ?? '').trim();
    if (accionTomada.length < 10) {
      return errores.validacion({ accionTomada: 'Describe la acción tomada (mínimo 10 caracteres)' });
    }
    const validada = validarCausa(String(body.causaId ?? ''), deteccion.lineaId);
    if (validada instanceof Response) return validada;
    const { causa, tipoId } = validada;
    const numeroSolicitud = body.numeroSolicitud ? String(body.numeroSolicitud).trim() : undefined;
    const evidenciaUrl = body.evidenciaUrl ? String(body.evidenciaUrl) : undefined;
    const requisitos = validarRequisitos(causa, numeroSolicitud, evidenciaUrl);
    if (requisitos) return requisitos;
    const solape = conflictoSolape(deteccion.lineaId, deteccion.detectadaEn, null);
    if (solape) return solape;

    const parada: Parada = {
      id: nextId('PAR'),
      ordenId: ordenLinea.id,
      lineaId: deteccion.lineaId,
      causaId: causa.id,
      tipoCausaId: tipoId,
      inicio: deteccion.detectadaEn,
      fin: null,
      duracionMin: deteccion.minutos,
      accionTomada,
      numeroSolicitud,
      evidenciaUrl,
      afectaOee: causa.afectaOee,
      responsableId: usuario.id,
      origen: 'iot',
      deteccionId: deteccion.id,
      tiempoRegistroSeg: Number(body.tiempoRegistroSeg ?? 0),
    };
    store.paradas.unshift(parada);
    deteccion.estado = 'confirmada';
    deteccion.paradaId = parada.id;
    recalcularOrden(parada.ordenId);
    sincronizarTiempoReal(parada);
    registrarTri(`Parada IoT ${textoCausa(causa.id)}`, parada.tiempoRegistroSeg, parada.inicio.slice(0, 10), parada.id);
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
    const { usuario, respuesta } = exigeRoles(request, ROLES_CAPTURA_PARADA);
    if (respuesta) return respuesta;
    const deteccion = store.detecciones.find((d) => d.id === params.id);
    if (!deteccion) return errores.noEncontrado('Detección IoT');
    if (deteccion.estado !== 'sugerida') {
      return errores.conflicto('La detección ya fue procesada', { estado: deteccion.estado });
    }
    const sinAcceso = accesoLinea(usuario, deteccion.lineaId);
    if (sinAcceso) return sinAcceso;
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
