import { http, HttpResponse } from 'msw';
import type { CausaParada, CausaParadaNodo, Maquina, Producto } from '@mes/types';
import {
  causasMerma,
  colaboradoresBase,
  lineas,
  sedes,
  toUser,
  turnos,
  usuarios,
} from '../data';
import { getStore, nextId } from '../store';
import { API, errores, listaQuery, preludio } from './_utils';

function construirArbol(causas: CausaParada[]): CausaParadaNodo[] {
  const nodos = new Map<string, CausaParadaNodo>();
  for (const c of causas) nodos.set(c.id, { ...c, hijos: [] });
  const raices: CausaParadaNodo[] = [];
  for (const nodo of nodos.values()) {
    if (nodo.parentId) nodos.get(nodo.parentId)?.hijos.push(nodo);
    else raices.push(nodo);
  }
  return raices;
}

export const catalogsHandlers = [
  http.get(`${API}/sedes`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({ data: sedes });
  }),

  http.get(`${API}/turnos`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({ data: turnos });
  }),

  http.get(`${API}/lineas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const sedeId = url.searchParams.get('sedeId');
    const data = sedeId ? lineas.filter((l) => l.sedeId === sedeId) : lineas;
    return HttpResponse.json({ data });
  }),

  http.get(`${API}/productos`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaId = url.searchParams.get('lineaId');
    const productos = getStore().productos;
    const data = lineaId ? productos.filter((p) => p.lineaId === lineaId) : productos;
    return HttpResponse.json({ data });
  }),

  /* Velocidad estándar editable desde Configuración → Productos y velocidades. */
  http.patch(`${API}/productos/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const producto = getStore().productos.find((p) => p.id === params.id);
    if (!producto) return errores.noEncontrado('Producto');
    const body = (await request.json()) as Partial<Producto>;
    if (body.velocidadEstandar !== undefined) {
      const valor = Number(body.velocidadEstandar);
      if (!Number.isFinite(valor) || valor <= 0 || valor > 1000) {
        return errores.validacion({ velocidadEstandar: 'Debe estar entre 1 y 1 000 u/min' });
      }
      producto.velocidadEstandar = valor;
    }
    if (body.estado) producto.estado = body.estado;
    return HttpResponse.json(producto);
  }),

  /* Directorio de personas — Configuración → Sedes y usuarios (solo lectura). */
  http.get(`${API}/usuarios`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const roles = listaQuery(url, 'rol');
    const sedeId = url.searchParams.get('sedeId');
    const lineaId = url.searchParams.get('lineaId');
    let data = usuarios.map(toUser);
    if (roles.length > 0) data = data.filter((u) => roles.includes(u.rol));
    if (sedeId) data = data.filter((u) => u.sedeId === sedeId);
    if (lineaId) data = data.filter((u) => !u.lineaId || u.lineaId === lineaId);
    return HttpResponse.json({ data });
  }),

  /* Cuadrilla del turno — paso "Equipo" al iniciar una orden. */
  http.get(`${API}/colaboradores`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({ data: colaboradoresBase });
  }),

  http.get(`${API}/maquinas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaId = url.searchParams.get('lineaId');
    const estados = listaQuery(url, 'estado');
    let data = getStore().maquinas;
    if (lineaId) data = data.filter((m) => m.lineaId === lineaId);
    if (estados.length > 0) data = data.filter((m) => estados.includes(m.estado));
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/maquinas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const body = (await request.json()) as Partial<Maquina>;
    const store = getStore();
    if (store.maquinas.some((m) => m.codigo === body.codigo)) {
      return errores.conflicto('Ya existe una máquina con ese código', { codigo: body.codigo });
    }
    const nueva: Maquina = {
      id: nextId('MAQ'),
      codigo: body.codigo ?? 'MQ-L1-99',
      nombre: body.nombre ?? 'Máquina nueva',
      tipo: body.tipo ?? 'Sin tipo',
      lineaId: body.lineaId ?? 'LIN-01',
      estado: body.estado ?? 'operativa',
      paradas30d: 0,
    };
    store.maquinas.push(nueva);
    return HttpResponse.json(nueva, { status: 201 });
  }),

  http.patch(`${API}/maquinas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const maquina = store.maquinas.find((m) => m.id === params.id);
    if (!maquina) return errores.noEncontrado('Máquina');
    Object.assign(maquina, (await request.json()) as Partial<Maquina>);
    return HttpResponse.json(maquina);
  }),

  http.get(`${API}/causas-parada`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const formato = url.searchParams.get('formato') ?? 'arbol';
    const nivel = url.searchParams.get('nivel');
    const lineaId = url.searchParams.get('lineaId');
    let causas = getStore().causasParada;
    if (lineaId) {
      causas = causas.filter(
        (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(lineaId)
      );
    }
    if (nivel) causas = causas.filter((c) => c.nivel === nivel);
    if (formato === 'plano' || nivel) return HttpResponse.json({ data: causas });
    return HttpResponse.json({ data: construirArbol(causas) });
  }),

  http.post(`${API}/causas-parada`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const body = (await request.json()) as Partial<CausaParada>;
    const store = getStore();
    if (store.causasParada.some((c) => c.codigo === body.codigo)) {
      return errores.conflicto('Ya existe una causa con ese código', { codigo: body.codigo });
    }
    const nueva: CausaParada = {
      id: `CPA-${body.codigo ?? nextId('X')}`,
      codigo: body.codigo ?? 'PM-01-99',
      nombre: body.nombre ?? 'Causa nueva',
      nivel: body.nivel ?? 'especifica',
      parentId: body.parentId ?? null,
      clasificacion: body.clasificacion ?? 'imprevista',
      afectaOee: body.afectaOee ?? true,
      requiereEvidencia: body.requiereEvidencia ?? false,
      requiereSolicitud: body.requiereSolicitud ?? false,
      tiempoEstandarMin: body.tiempoEstandarMin ?? 0,
      lineasAplicables: body.lineasAplicables ?? [],
      estado: body.estado ?? 'activo',
      paradasHistoricas: 0,
    };
    store.causasParada.push(nueva);
    return HttpResponse.json(nueva, { status: 201 });
  }),

  http.patch(`${API}/causas-parada/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const causa = store.causasParada.find((c) => c.id === params.id);
    if (!causa) return errores.noEncontrado('Causa de parada');
    Object.assign(causa, (await request.json()) as Partial<CausaParada>);
    return HttpResponse.json(causa);
  }),

  http.delete(`${API}/causas-parada/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const indice = store.causasParada.findIndex((c) => c.id === params.id);
    if (indice < 0) return errores.noEncontrado('Causa de parada');
    const causa = store.causasParada[indice]!;
    const enUso = store.paradas.filter((p) => p.causaId === causa.id).length + causa.paradasHistoricas;
    /* La causa se desactiva, nunca se borra: las paradas históricas conservan el código. */
    causa.estado = 'inactivo';
    return HttpResponse.json({
      id: causa.id,
      codigo: causa.codigo,
      estado: causa.estado,
      paradasConservadas: enUso,
      mensaje: `Hay ${enUso} paradas históricas con esta causa; se conservarán con el código ${causa.codigo}.`,
    });
  }),

  http.get(`${API}/causas-merma`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const tipo = url.searchParams.get('tipo');
    const data = tipo
      ? causasMerma.filter((c) => c.aplicaA.includes(tipo as 'MP' | 'EP' | 'PT'))
      : causasMerma;
    return HttpResponse.json({ data });
  }),
];
