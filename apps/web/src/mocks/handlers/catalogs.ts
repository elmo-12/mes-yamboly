import { http, HttpResponse } from 'msw';
import type {
  BajaCausaParadaResponse,
  BajaLogicaResponse,
  CausaMerma,
  CausaMermaNodo,
  CausaParada,
  CausaParadaNodo,
  EstadoCatalogo,
  Maquina,
  Producto,
  Sede,
  TipoMermaCodigo,
  TipoProcesoLinea,
  VelocidadEstandar,
  VelocidadEstandarListItem,
} from '@mes/types';
import { lineaPorId, lineas, turnos } from '../data';
import { getStore } from '../store';
import { API, errores, listaQuery, normalizar, preludio } from './_utils';

/** Texto de los campos sin resolver, igual que `GUION` en `catalogs.service.ts`. */
const GUION = '—';

/** `velocidadUnidMin = velocidadUnidHora / 60` redondeado a 1 decimal. */
function unidadesPorMinuto(velocidadUnidHora: number): number {
  return Math.round((velocidadUnidHora / 60) * 10) / 10;
}

/** Reconstruye un árbol de causas (parada o merma) a partir de `parentId`. */
function construirArbol<T extends { id: string; parentId: string | null }>(
  causas: T[]
): (T & { hijos: T[] })[] {
  type Nodo = T & { hijos: Nodo[] };
  const nodos = new Map<string, Nodo>();
  for (const c of causas) nodos.set(c.id, { ...c, hijos: [] } as Nodo);
  const raices: Nodo[] = [];
  for (const nodo of nodos.values()) {
    if (nodo.parentId) nodos.get(nodo.parentId)?.hijos.push(nodo);
    else raices.push(nodo);
  }
  return raices;
}

/* ------------------------------------------------------------------ */
/* Validación 422 (espejo de los DTO class-validator de la API)        */
/* ------------------------------------------------------------------ */

type Detalles = Record<string, string>;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function numero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(valor);
}

function exigirTexto(
  detalles: Detalles,
  campo: string,
  valor: unknown,
  minimo: number,
  mensaje: string
): void {
  if (texto(valor).trim().length < minimo) detalles[campo] = mensaje;
}

function exigirPatron(
  detalles: Detalles,
  campo: string,
  valor: unknown,
  patron: RegExp,
  mensaje: string
): void {
  if (!patron.test(texto(valor))) detalles[campo] = mensaje;
}

function exigirRango(
  detalles: Detalles,
  campo: string,
  valor: unknown,
  min: number,
  max: number,
  mensajeMin: string,
  mensajeMax: string
): void {
  const n = numero(valor);
  if (!Number.isFinite(n)) detalles[campo] = mensajeMin;
  else if (n < min) detalles[campo] = mensajeMin;
  else if (n > max) detalles[campo] = mensajeMax;
}

/* ------------------------------------------------------------------ */
/* Sedes                                                               */
/* ------------------------------------------------------------------ */

const sedesHandlers = [
  http.get(`${API}/sedes`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const data = [...getStore().sedes].sort((a, b) => a.id.localeCompare(b.id));
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/sedes`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      body.codigo,
      /^[A-Z]{3,4}$/,
      'Formato esperado AREQ (3 o 4 letras mayúsculas)'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    exigirTexto(detalles, 'ciudad', body.ciudad, 3, 'La ciudad es obligatoria');
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo);
    if (store.sedes.some((s) => s.codigo === codigo)) {
      return errores.conflicto('Ya existe una sede con ese código', { codigo });
    }
    /* Misma convención que el maestro real: `SED-AREQUIPA`, `SED-LIMA`. */
    const nombre = texto(body.nombre);
    const slug = normalizar(nombre)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = `SED-${slug || codigo}`;
    if (store.sedes.some((s) => s.id === id)) {
      return errores.conflicto('Ya existe una sede con ese nombre', { nombre });
    }

    const sede: Sede = {
      id,
      codigo,
      nombre,
      ciudad: texto(body.ciudad),
      activa: body.activa === undefined ? true : Boolean(body.activa),
    };
    store.sedes.push(sede);
    return HttpResponse.json(sede, { status: 201 });
  }),

  http.patch(`${API}/sedes/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const sede = store.sedes.find((s) => s.id === params.id);
    if (!sede) return errores.noEncontrado('Sede');
    const body = (await request.json()) as Partial<Sede>;
    if (body.codigo && body.codigo !== sede.codigo) {
      if (store.sedes.some((s) => s.codigo === body.codigo)) {
        return errores.conflicto('Ya existe una sede con ese código', { codigo: body.codigo });
      }
    }
    Object.assign(sede, body);
    return HttpResponse.json(sede);
  }),
];

/* ------------------------------------------------------------------ */
/* Sabores, líneas y turnos                                            */
/* ------------------------------------------------------------------ */

const maestrosHandlers = [
  http.get(`${API}/turnos`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({ data: turnos });
  }),

  http.get(`${API}/sabores`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const estado = new URL(request.url).searchParams.get('estado');
    const filas = [...getStore().sabores].sort((a, b) => a.nombre.localeCompare(b.nombre));
    const data = estado ? filas.filter((s) => s.estado === estado) : filas;
    return HttpResponse.json({ data });
  }),

  http.get(`${API}/lineas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const sedeId = url.searchParams.get('sedeId');
    const tipoProceso = url.searchParams.get('tipoProceso');
    const estado = url.searchParams.get('estado');
    const data = [...lineas]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((l) => (sedeId ? l.sedeId === sedeId : true))
      .filter((l) => (tipoProceso ? l.tipoProceso === tipoProceso : true))
      .filter((l) => (estado ? l.estado === estado : true));
    return HttpResponse.json({ data });
  }),
];

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

const productosHandlers = [
  http.get(`${API}/productos`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const store = getStore();
    const lineaId = url.searchParams.get('lineaId');
    const estado = url.searchParams.get('estado');
    const search = url.searchParams.get('search');

    let filas = [...store.productos].sort((a, b) => a.codigo.localeCompare(b.codigo));
    if (lineaId) {
      const conPar = new Set(
        store.velocidadesEstandar
          .filter((v) => v.lineaId === lineaId && v.estado === 'activo')
          .map((v) => v.productoId)
      );
      filas = filas.filter((p) => conPar.has(p.id));
    }
    if (estado) filas = filas.filter((p) => p.estado === estado);
    if (search) {
      const buscado = normalizar(search);
      filas = filas.filter((p) =>
        [p.codigo, p.nombre, p.descripcionCorta, p.descripcionLarga, p.alias ?? '']
          .map(normalizar)
          .some((campo) => campo.includes(buscado))
      );
    }
    return HttpResponse.json({ data: filas });
  }),

  http.post(`${API}/productos`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      body.codigo,
      /^\d{7}$/,
      'Formato esperado 1110001 (7 dígitos)'
    );
    exigirTexto(
      detalles,
      'descripcionLarga',
      body.descripcionLarga,
      3,
      'La descripción larga es obligatoria'
    );
    exigirTexto(
      detalles,
      'descripcionCorta',
      body.descripcionCorta,
      3,
      'La descripción corta es obligatoria'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    if (!(numero(body.pesoKg) > 0)) detalles.pesoKg = 'El peso debe ser mayor que 0';
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo);
    if (store.productos.some((p) => p.codigo === codigo)) {
      return errores.conflicto('Ya existe un producto con ese código', { codigo });
    }

    const producto: Producto = {
      id: `PRD-${codigo}`,
      codigo,
      nombre: texto(body.nombre),
      descripcionLarga: texto(body.descripcionLarga),
      descripcionCorta: texto(body.descripcionCorta),
      alias: body.alias === undefined ? null : (body.alias as string | null),
      marca: body.marca === undefined ? null : (body.marca as string | null),
      presentacion: body.presentacion === undefined ? null : (body.presentacion as string | null),
      unidadesPorCaja: body.unidadesPorCaja === undefined ? 1 : numero(body.unidadesPorCaja),
      pesoKg: numero(body.pesoKg),
      saborId: body.saborId === undefined ? null : (body.saborId as string | null),
      sabor: texto(body.sabor),
      estado: (body.estado as EstadoCatalogo | undefined) ?? 'activo',
    };
    store.productos.push(producto);
    return HttpResponse.json(producto, { status: 201 });
  }),

  http.patch(`${API}/productos/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const producto = store.productos.find((p) => p.id === params.id);
    if (!producto) return errores.noEncontrado('Producto');
    const body = (await request.json()) as Partial<Producto>;
    if (body.codigo && body.codigo !== producto.codigo) {
      if (store.productos.some((p) => p.codigo === body.codigo)) {
        return errores.conflicto('Ya existe un producto con ese código', { codigo: body.codigo });
      }
    }
    Object.assign(producto, body);
    return HttpResponse.json(producto);
  }),

  /** Baja lógica: el producto pasa a `inactivo` y conserva sus órdenes. */
  http.delete(`${API}/productos/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const producto = store.productos.find((p) => p.id === params.id);
    if (!producto) return errores.noEncontrado('Producto');
    const conservados = store.ordenes.filter((o) => o.productoId === producto.id).length;
    producto.estado = 'inactivo';
    const respuesta: BajaLogicaResponse = {
      id: producto.id,
      codigo: producto.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes',
      mensaje: `Hay ${conservados} órdenes con este producto; se conservarán con el código ${producto.codigo}.`,
    };
    return HttpResponse.json(respuesta);
  }),
];

/* ------------------------------------------------------------------ */
/* Velocidades estándar (pares producto × línea)                       */
/* ------------------------------------------------------------------ */

function enriquecerPar(par: VelocidadEstandar): VelocidadEstandarListItem {
  const producto = getStore().productos.find((p) => p.id === par.productoId);
  const linea = lineaPorId.get(par.lineaId);
  return {
    ...par,
    productoCodigo: producto?.codigo ?? GUION,
    productoNombre: producto?.nombre ?? GUION,
    lineaCodigo: linea?.codigo ?? GUION,
    lineaNombre: linea?.nombre ?? GUION,
    tipoProceso: linea?.tipoProceso ?? ('llenadora' as TipoProcesoLinea),
  };
}

/**
 * Correlativo del alta a partir del id máximo, no del tamaño del catálogo: el
 * maestro llega hasta `VE-0340` con 333 pares vivos (los pares de productos
 * filtrados no se sembraron), así que `length + 1` devolvía un id ya en uso y
 * el alta pisaba el par de otro producto. Espejo de `catalogs.service.ts`.
 */
function siguienteIdVelocidad(pares: readonly VelocidadEstandar[]): string {
  const maximo = pares.reduce((n, { id }) => Math.max(n, Number(id.slice(3)) || 0), 0);
  return `VE-${String(maximo + 1).padStart(4, '0')}`;
}

const velocidadesHandlers = [
  http.get(`${API}/velocidades-estandar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const productoId = url.searchParams.get('productoId');
    const lineaId = url.searchParams.get('lineaId');
    const estado = url.searchParams.get('estado');

    let filas = [...getStore().velocidadesEstandar].sort((a, b) => a.id.localeCompare(b.id));
    if (productoId) filas = filas.filter((v) => v.productoId === productoId);
    if (lineaId) filas = filas.filter((v) => v.lineaId === lineaId);
    if (estado) filas = filas.filter((v) => v.estado === estado);
    return HttpResponse.json({ data: filas.map(enriquecerPar) });
  }),

  http.post(`${API}/velocidades-estandar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles: Detalles = {};
    exigirTexto(detalles, 'productoId', body.productoId, 1, 'Selecciona un producto');
    exigirTexto(detalles, 'lineaId', body.lineaId, 1, 'Selecciona una línea');
    exigirRango(
      detalles,
      'velocidadUnidHora',
      body.velocidadUnidHora,
      1,
      60_000,
      'Debe ser mayor que 0',
      'Velocidad fuera de rango'
    );
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const productoId = texto(body.productoId);
    const lineaId = texto(body.lineaId);
    if (!store.productos.some((p) => p.id === productoId)) {
      return errores.validacion({ productoId: 'El producto no existe' });
    }
    if (!lineaPorId.has(lineaId)) {
      return errores.validacion({ lineaId: 'La línea no existe' });
    }
    if (
      store.velocidadesEstandar.some((v) => v.productoId === productoId && v.lineaId === lineaId)
    ) {
      return errores.conflicto('Ya existe una velocidad para ese producto y línea', {
        productoId,
        lineaId,
      });
    }

    const velocidadUnidHora = numero(body.velocidadUnidHora);
    const par: VelocidadEstandar = {
      id: siguienteIdVelocidad(store.velocidadesEstandar),
      productoId,
      lineaId,
      velocidadUnidHora,
      velocidadUnidMin: unidadesPorMinuto(velocidadUnidHora),
      mermaEstandarPct:
        body.mermaEstandarPct === undefined ? 0 : numero(body.mermaEstandarPct),
      cipMin: body.cipMin === undefined || body.cipMin === null ? null : numero(body.cipMin),
      arranqueMin:
        body.arranqueMin === undefined || body.arranqueMin === null
          ? null
          : numero(body.arranqueMin),
      estado: (body.estado as EstadoCatalogo | undefined) ?? 'activo',
    };
    store.velocidadesEstandar.push(par);
    return HttpResponse.json(par, { status: 201 });
  }),

  http.patch(`${API}/velocidades-estandar/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const par = store.velocidadesEstandar.find((v) => v.id === params.id);
    if (!par) return errores.noEncontrado('Velocidad estándar');
    const body = (await request.json()) as Partial<VelocidadEstandar>;

    const productoId = body.productoId ?? par.productoId;
    const lineaId = body.lineaId ?? par.lineaId;
    if (productoId !== par.productoId || lineaId !== par.lineaId) {
      const duplicado = store.velocidadesEstandar.find(
        (v) => v.productoId === productoId && v.lineaId === lineaId
      );
      if (duplicado && duplicado.id !== par.id) {
        return errores.conflicto('Ya existe una velocidad para ese producto y línea', {
          productoId,
          lineaId,
        });
      }
    }

    Object.assign(par, body);
    if (body.velocidadUnidHora !== undefined) {
      par.velocidadUnidMin = unidadesPorMinuto(body.velocidadUnidHora);
    }
    return HttpResponse.json(par);
  }),

  /** Baja lógica: el par pasa a `inactivo`; las órdenes conservan su valor. */
  http.delete(`${API}/velocidades-estandar/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const par = store.velocidadesEstandar.find((v) => v.id === params.id);
    if (!par) return errores.noEncontrado('Velocidad estándar');
    const conservados = store.ordenes.filter((o) => o.velocidadEstandarId === par.id).length;
    par.estado = 'inactivo';
    const respuesta: BajaLogicaResponse = {
      id: par.id,
      codigo: par.id,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes',
      mensaje: `Hay ${conservados} órdenes que congelaron esta velocidad; se conservarán con su valor.`,
    };
    return HttpResponse.json(respuesta);
  }),
];

/* ------------------------------------------------------------------ */
/* Máquinas (equipos de la línea)                                      */
/* ------------------------------------------------------------------ */

const maquinasHandlers = [
  http.get(`${API}/maquinas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaId = url.searchParams.get('lineaId');
    const estados = listaQuery(url, 'estado');
    let data = [...getStore().maquinas].sort((a, b) => a.id.localeCompare(b.id));
    if (lineaId) data = data.filter((m) => m.lineaId === lineaId);
    if (estados.length > 0) data = data.filter((m) => estados.includes(m.estado));
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/maquinas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      body.codigo,
      /^MQ-[A-Z0-9]{2,6}-\d{2}$/,
      'Formato esperado MQ-LLENM2-01'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    exigirTexto(detalles, 'tipo', body.tipo, 3, 'El tipo es obligatorio');
    exigirTexto(detalles, 'lineaId', body.lineaId, 1, 'Selecciona una línea');
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo);
    if (store.maquinas.some((m) => m.codigo === codigo)) {
      return errores.conflicto('Ya existe una máquina con ese código', { codigo });
    }
    const nueva: Maquina = {
      id: `MAQ-${String(store.maquinas.length + 1).padStart(2, '0')}`,
      codigo,
      nombre: texto(body.nombre),
      tipo: texto(body.tipo),
      lineaId: texto(body.lineaId),
      estado: (body.estado as Maquina['estado'] | undefined) ?? 'operativa',
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
    const body = (await request.json()) as Partial<Maquina>;
    if (body.codigo && body.codigo !== maquina.codigo) {
      if (store.maquinas.some((m) => m.codigo === body.codigo)) {
        return errores.conflicto('Ya existe una máquina con ese código', { codigo: body.codigo });
      }
    }
    Object.assign(maquina, body);
    return HttpResponse.json(maquina);
  }),

  /** Baja lógica: la máquina pasa a `baja` y conserva sus paradas históricas. */
  http.delete(`${API}/maquinas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const maquina = store.maquinas.find((m) => m.id === params.id);
    if (!maquina) return errores.noEncontrado('Máquina');
    const conservados = store.paradas.filter((p) => p.maquinaId === maquina.id).length;
    maquina.estado = 'baja';
    const respuesta: BajaLogicaResponse = {
      id: maquina.id,
      codigo: maquina.codigo,
      estado: 'baja',
      conservados,
      etiquetaConservados: 'paradas',
      mensaje: `Hay ${conservados} paradas registradas en esta máquina; se conservarán con el código ${maquina.codigo}.`,
    };
    return HttpResponse.json(respuesta);
  }),
];

/* ------------------------------------------------------------------ */
/* Causas de parada (árbol Tipo → General → Específica)                */
/* ------------------------------------------------------------------ */

const causasParadaHandlers = [
  http.get(`${API}/causas-parada`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const formato = url.searchParams.get('formato') ?? 'arbol';
    const nivel = url.searchParams.get('nivel');
    const lineaId = url.searchParams.get('lineaId');
    let causas = [...getStore().causasParada].sort((a, b) => a.codigo.localeCompare(b.codigo));
    if (lineaId) {
      causas = causas.filter(
        (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(lineaId)
      );
    }
    if (nivel) causas = causas.filter((c) => c.nivel === nivel);
    if (formato === 'plano' || nivel) return HttpResponse.json({ data: causas });
    return HttpResponse.json({ data: construirArbol(causas) as CausaParadaNodo[] });
  }),

  http.post(`${API}/causas-parada`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Partial<CausaParada>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      body.codigo,
      /^P[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/,
      'Formato esperado PP-01, PP-01-A o PP-01-01'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    if (!body.nivel) detalles.nivel = 'Selecciona el nivel de la causa';
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = body.codigo!;
    if (store.causasParada.some((c) => c.codigo === codigo)) {
      return errores.conflicto('Ya existe una causa con ese código', { codigo });
    }
    const nueva: CausaParada = {
      id: `CPA-${codigo}`,
      codigo,
      nombre: body.nombre!,
      nivel: body.nivel!,
      parentId: body.parentId ?? null,
      clasificacion: body.clasificacion ?? 'imprevista',
      afectaOee: body.afectaOee ?? true,
      requiereEvidencia: body.requiereEvidencia ?? false,
      requiereSolicitud: body.requiereSolicitud ?? false,
      tiempoEstandarMin: body.tiempoEstandarMin ?? 0,
      lineasAplicables: body.lineasAplicables ?? [],
      estado: body.estado ?? 'activo',
      paradasHistoricas: 0,
      codigoLegado: body.codigoLegado ?? null,
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
    const causa = store.causasParada.find((c) => c.id === params.id);
    if (!causa) return errores.noEncontrado('Causa de parada');
    const conservados =
      store.paradas.filter((p) => p.causaId === causa.id).length + causa.paradasHistoricas;
    /* La causa se desactiva, nunca se borra: las paradas históricas conservan el código. */
    causa.estado = 'inactivo';
    const respuesta: BajaCausaParadaResponse = {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      paradasConservadas: conservados,
      etiquetaConservados: 'paradas',
      mensaje: `Hay ${conservados} paradas históricas con esta causa; se conservarán con el código ${causa.codigo}.`,
    };
    return HttpResponse.json(respuesta);
  }),
];

/* ------------------------------------------------------------------ */
/* Causas de merma (árbol Tipo → Clasificación → Causa)                */
/* ------------------------------------------------------------------ */

const causasMermaHandlers = [
  http.get(`${API}/causas-merma`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const formato = url.searchParams.get('formato') ?? 'arbol';
    const nivel = url.searchParams.get('nivel');
    const tipo = url.searchParams.get('tipo') as TipoMermaCodigo | null;
    const lineaId = url.searchParams.get('lineaId');

    let causas = [...getStore().causasMerma].sort((a, b) => a.codigo.localeCompare(b.codigo));
    if (lineaId) {
      causas = causas.filter(
        (c) => c.lineasAplicables.length === 0 || c.lineasAplicables.includes(lineaId)
      );
    }
    if (tipo) causas = causas.filter((c) => c.aplicaA.length === 0 || c.aplicaA.includes(tipo));
    if (nivel) causas = causas.filter((c) => c.nivel === nivel);
    if (formato === 'plano' || nivel) return HttpResponse.json({ data: causas });
    return HttpResponse.json({ data: construirArbol(causas) as CausaMermaNodo[] });
  }),

  http.post(`${API}/causas-merma`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Partial<CausaMerma>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      body.codigo,
      /^M[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/,
      'Formato esperado MP-01, MP-01-A o MP-01-01'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    if (!body.nivel) detalles.nivel = 'Selecciona el nivel de la causa';
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = body.codigo!;
    if (store.causasMerma.some((c) => c.codigo === codigo)) {
      return errores.conflicto('Ya existe una causa con ese código', { codigo });
    }
    const nueva: CausaMerma = {
      id: `CME-${codigo}`,
      codigo,
      nombre: body.nombre!,
      nivel: body.nivel!,
      parentId: body.parentId ?? null,
      aplicaA: body.aplicaA ?? [],
      lineasAplicables: body.lineasAplicables ?? [],
      requiereEvidencia: body.requiereEvidencia ?? false,
      requiereComentario: body.requiereComentario ?? false,
      requiereSolicitud: body.requiereSolicitud ?? false,
      estado: body.estado ?? 'activo',
      mermasHistoricas: 0,
    };
    store.causasMerma.push(nueva);
    return HttpResponse.json(nueva, { status: 201 });
  }),

  http.patch(`${API}/causas-merma/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const causa = store.causasMerma.find((c) => c.id === params.id);
    if (!causa) return errores.noEncontrado('Causa de merma');
    Object.assign(causa, (await request.json()) as Partial<CausaMerma>);
    return HttpResponse.json(causa);
  }),

  /** Baja lógica: la causa pasa a `inactivo` y conserva sus mermas históricas. */
  http.delete(`${API}/causas-merma/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const causa = store.causasMerma.find((c) => c.id === params.id);
    if (!causa) return errores.noEncontrado('Causa de merma');
    const conservados =
      store.mermas.filter((m) => m.causaId === causa.id).length + causa.mermasHistoricas;
    causa.estado = 'inactivo';
    const respuesta: BajaLogicaResponse = {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'mermas',
      mensaje: `Hay ${conservados} mermas históricas con esta causa; se conservarán con el código ${causa.codigo}.`,
    };
    return HttpResponse.json(respuesta);
  }),
];

/** Espejo de `apps/api/src/modules/catalogs/catalogs.controller.ts`. */
export const catalogsHandlers = [
  ...sedesHandlers,
  ...maestrosHandlers,
  ...productosHandlers,
  ...velocidadesHandlers,
  ...maquinasHandlers,
  ...causasParadaHandlers,
  ...causasMermaHandlers,
];
