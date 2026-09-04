import { http, HttpResponse } from 'msw';
import type {
  BajaCausaParadaResponse,
  BajaLogicaResponse,
  CausaMerma,
  CausaMermaNodo,
  CausaParada,
  CausaParadaNodo,
  EstadoCatalogo,
  Linea,
  LineaListItem,
  Producto,
  TipoMermaCodigo,
  TipoProcesoLinea,
  VelocidadEstandar,
  VelocidadEstandarListItem,
} from '@mes/types';
import { TIPOS_PROCESO_LINEA } from '@mes/types';
import { lineaPorId, turnos } from '../data';
import { getStore } from '../store';
import { API, errores, normalizar, preludio } from './_utils';

/** Texto de los campos sin resolver, igual que `GUION` en `catalogs.service.ts`. */
const GUION = '—';

/** `velocidadUnidMin = velocidadUnidHora / 60` redondeado a 1 decimal. */
function unidadesPorMinuto(velocidadUnidHora: number): number {
  return Math.round((velocidadUnidHora / 60) * 10) / 10;
}

/** Ventana del contador `paradas30d` de cada línea (espejo de `CatalogsService`). */
const DIAS_VENTANA_PARADAS = 30;

/**
 * Resuelve los contadores del mantenedor de líneas: pares producto × línea
 * activos y paradas de los últimos 30 días. Con datos congelados la referencia
 * es la parada más reciente del conjunto, no el reloj del navegador.
 */
function enriquecerLineas(filas: Linea[]): LineaListItem[] {
  const store = getStore();
  const conVelocidad = new Map<string, number>();
  for (const par of store.velocidadesEstandar) {
    if (par.estado !== 'activo') continue;
    conVelocidad.set(par.lineaId, (conVelocidad.get(par.lineaId) ?? 0) + 1);
  }
  const paradas30d = new Map<string, number>();
  if (store.paradas.length > 0) {
    const ultima = store.paradas.reduce(
      (max, p) => (p.inicio > max ? p.inicio : max),
      store.paradas[0]!.inicio
    );
    const desde = new Date(ultima);
    desde.setDate(desde.getDate() - DIAS_VENTANA_PARADAS);
    const limite = desde.toISOString().slice(0, 19);
    for (const p of store.paradas) {
      if (p.inicio >= limite) paradas30d.set(p.lineaId, (paradas30d.get(p.lineaId) ?? 0) + 1);
    }
  }
  return filas.map((l) => ({
    ...l,
    productosConVelocidad: conVelocidad.get(l.id) ?? 0,
    paradas30d: paradas30d.get(l.id) ?? 0,
  }));
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
    const tipoProceso = url.searchParams.get('tipoProceso');
    const estado = url.searchParams.get('estado');
    const data = enriquecerLineas(
      [...getStore().lineas]
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter((l) => (tipoProceso ? l.tipoProceso === tipoProceso : true))
        .filter((l) => (estado ? l.estado === estado : true))
    );
    return HttpResponse.json({ data });
  }),

  http.post(`${API}/lineas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      body.codigo,
      /^[A-Z]{3,4}-[A-Z]?\d{1,2}$/,
      'Formato esperado LLEN-M2, EXTR-2 o MOLD-A3'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    exigirTexto(detalles, 'nombreCorto', body.nombreCorto, 2, 'El nombre corto es obligatorio');
    if (!TIPOS_PROCESO_LINEA.includes(body.tipoProceso as TipoProcesoLinea)) {
      detalles.tipoProceso = 'Selecciona el tipo de proceso';
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo);
    if (store.lineas.some((l) => l.codigo === codigo)) {
      return errores.conflicto('Ya existe una línea con ese código', { codigo });
    }
    const nueva: Linea = {
      id: `LIN-${codigo}`,
      codigo,
      nombre: texto(body.nombre),
      nombreCorto: texto(body.nombreCorto),
      tipoProceso: body.tipoProceso as TipoProcesoLinea,
      estado: (body.estado as EstadoCatalogo | undefined) ?? 'activo',
      capacidadUnidadesMin: Number(body.capacidadUnidadesMin ?? 0),
    };
    store.lineas.push(nueva);
    return HttpResponse.json(nueva, { status: 201 });
  }),

  http.patch(`${API}/lineas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const linea = store.lineas.find((l) => l.id === params.id);
    if (!linea) return errores.noEncontrado('Línea');
    const body = (await request.json()) as Partial<Linea>;
    if (body.codigo && body.codigo !== linea.codigo) {
      if (store.lineas.some((l) => l.codigo === body.codigo)) {
        return errores.conflicto('Ya existe una línea con ese código', { codigo: body.codigo });
      }
    }
    Object.assign(linea, body);
    return HttpResponse.json(linea);
  }),

  /** Baja lógica: la línea pasa a `inactivo` y conserva órdenes y paradas. */
  http.delete(`${API}/lineas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const linea = store.lineas.find((l) => l.id === params.id);
    if (!linea) return errores.noEncontrado('Línea');
    const conservados =
      store.ordenes.filter((o) => o.lineaId === linea.id).length +
      store.paradas.filter((p) => p.lineaId === linea.id).length;
    linea.estado = 'inactivo';
    const respuesta: BajaLogicaResponse = {
      id: linea.id,
      codigo: linea.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes y paradas',
      mensaje: `Hay ${conservados} órdenes y paradas registradas en esta línea; se conservarán con el código ${linea.codigo}.`,
    };
    return HttpResponse.json(respuesta);
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
  ...maestrosHandlers,
  ...productosHandlers,
  ...velocidadesHandlers,
  ...causasParadaHandlers,
  ...causasMermaHandlers,
];
