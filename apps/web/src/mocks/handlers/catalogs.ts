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
import {
  CAPACIDAD_LINEA_MAX,
  MENSAJE_CONFLICTO_VERSION,
  NIVELES_CAUSA,
  NIVELES_CAUSA_MERMA,
  TIPOS_PROCESO_LINEA,
} from '@mes/types';
import { turnos } from '../data';
import { getStore } from '../store';
import { API, error, errores, normalizar, preludio } from './_utils';
import { exigeRol } from './auth';

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
/* Reglas comunes de alta y edición (espejo de `CatalogsService`)      */
/* ------------------------------------------------------------------ */

/** 404 con el mensaje completo (`Línea no encontrada`), como `RecursoNoEncontradoException`. */
function noEncontrado(mensaje: string): Response {
  return error(404, 'NOT_FOUND', mensaje);
}

/** Registro con versión de concurrencia optimista. */
type Versionado = { version?: number };

/**
 * Espejo de `guardarConVersion`: 409 con {@link MENSAJE_CONFLICTO_VERSION} si
 * la versión leída no es la vigente; si coincide (o no llega), aplica los
 * cambios y sube la versión.
 */
function guardarConVersion<T extends Versionado>(
  entidad: T,
  cambios: Partial<T>,
  versionLeida?: unknown
): Response | null {
  const vigente = entidad.version ?? 1;
  if (typeof versionLeida === 'number' && versionLeida !== vigente) {
    return errores.conflicto(MENSAJE_CONFLICTO_VERSION, { version: vigente, versionEnviada: versionLeida });
  }
  Object.assign(entidad, cambios);
  entidad.version = vigente + 1;
  return null;
}

/** 422 si alguno de `campos` llega a `null` (espejo de `rechazarNulos`). */
function rechazarNulos(body: Record<string, unknown>, campos: readonly string[]): Response | null {
  const nulos = campos.filter((c) => body[c] === null);
  if (nulos.length === 0) return null;
  return errores.validacion(Object.fromEntries(nulos.map((c) => [c, 'Este campo no puede ser nulo'])));
}

/** 422 si `nuevo` llega y difiere de `actual` (campos inmutables tras el alta). */
function inmutable(campo: string, actual: string, nuevo: unknown, mensaje: string): Response | null {
  return nuevo !== undefined && nuevo !== actual ? errores.validacion({ [campo]: mensaje }) : null;
}

/** Quita del cuerpo los campos que nunca se copian sobre el registro. */
function sinControl(body: Record<string, unknown>, ...extra: string[]): Record<string, unknown> {
  const fuera = new Set(['id', 'version', ...extra]);
  return Object.fromEntries(Object.entries(body).filter(([k]) => !fuera.has(k)));
}

/** 409 si el código **o el id derivado** ya existen (espejo de `verificarAltaLibre`). */
function altaOcupada(
  filas: readonly { id: string; codigo: string }[],
  id: string,
  codigo: string,
  articulo: string
): Response | null {
  return filas.some((f) => f.codigo === codigo || f.id === id)
    ? errores.conflicto(`Ya existe ${articulo} con ese código`, { codigo, id })
    : null;
}

/** Da de baja los pares activos de una línea o de un producto; devuelve cuántos. */
function bajaParesDe(filtro: { lineaId: string } | { productoId: string }): number {
  const pares = getStore().velocidadesEstandar.filter(
    (v) =>
      v.estado === 'activo' &&
      ('lineaId' in filtro ? v.lineaId === filtro.lineaId : v.productoId === filtro.productoId)
  );
  for (const par of pares) guardarConVersion(par, { estado: 'inactivo' as EstadoCatalogo });
  return pares.length;
}

/** Nodo de causa (parada o merma) con lo que miran las reglas del árbol. */
type NodoCausa = {
  id: string;
  codigo: string;
  nivel: string;
  parentId: string | null;
  estado: EstadoCatalogo;
  version?: number;
};

/** Todo el subárbol bajo `id` (sin incluirlo). */
function descendientes<T extends NodoCausa>(todas: readonly T[], id: string): T[] {
  const resultado: T[] = [];
  const pendientes = todas.filter((c) => c.parentId === id);
  const vistos = new Set<string>([id]);
  while (pendientes.length > 0) {
    const nodo = pendientes.shift()!;
    if (vistos.has(nodo.id)) continue;
    vistos.add(nodo.id);
    resultado.push(nodo);
    pendientes.push(...todas.filter((c) => c.parentId === nodo.id));
  }
  return resultado;
}

/** Marca inactivo el nodo y su subárbol; devuelve cuántas hijas cambiaron. */
function bajaSubarbol<T extends NodoCausa>(todas: readonly T[], causa: T): number {
  if (causa.estado !== 'inactivo') guardarConVersion<NodoCausa>(causa, { estado: 'inactivo' });
  let hijas = 0;
  for (const hija of descendientes(todas, causa.id)) {
    if (hija.estado === 'inactivo') continue;
    guardarConVersion<NodoCausa>(hija, { estado: 'inactivo' });
    hijas += 1;
  }
  return hijas;
}

/**
 * Espejo de `validarJerarquia`: el tipo es raíz con código `XX-NN`; el nivel 2
 * cuelga de un tipo y el 3 de un nivel 2, con tres segmentos y el prefijo de
 * su tipo. El padre debe existir y estar activo.
 */
function validarJerarquia(
  nivel: string,
  codigo: string,
  padre: NodoCausa | undefined,
  niveles: readonly string[],
  parentIdEnviado: string | null
): Response | null {
  const [nivelTipo, nivelMedio] = niveles;
  const prefijoTipo = (c: string) => c.split('-').slice(0, 2).join('-');
  if (nivel === nivelTipo) {
    if (parentIdEnviado) return errores.validacion({ parentId: 'Un tipo es raíz: no lleva nodo padre' });
    if (codigo.split('-').length !== 2) {
      return errores.validacion({ codigo: 'El código de un tipo tiene dos segmentos (p. ej. PN-02)' });
    }
    return null;
  }
  if (!parentIdEnviado) return errores.validacion({ parentId: 'Selecciona el nodo padre' });
  if (!padre) return errores.validacion({ parentId: 'El nodo padre no existe' });
  if (padre.estado !== 'activo') {
    return errores.validacion({ parentId: 'El nodo padre está inactivo; actívalo primero' });
  }
  const nivelPadreEsperado = nivel === nivelMedio ? nivelTipo : nivelMedio;
  if (padre.nivel !== nivelPadreEsperado) {
    return errores.validacion({ parentId: `El padre de este nivel debe ser de nivel «${nivelPadreEsperado}»` });
  }
  if (codigo.split('-').length !== 3) {
    return errores.validacion({
      codigo: 'El código de este nivel tiene tres segmentos (p. ej. PN-02-A o PN-02-01)',
    });
  }
  if (prefijoTipo(codigo) !== prefijoTipo(padre.codigo)) {
    return errores.validacion({ codigo: `El código debe empezar por ${prefijoTipo(padre.codigo)}- (el de su tipo)` });
  }
  return null;
}

/** `codigo`, `nivel` y `parentId` definen el id y la posición: no cambian (422). */
function posicionInmutable(causa: NodoCausa, body: Record<string, unknown>): Response | null {
  return (
    inmutable(
      'codigo',
      causa.codigo,
      body.codigo,
      'El código de la causa no se puede modificar: lo referencian los registros históricos'
    ) ??
    inmutable('nivel', causa.nivel, body.nivel, 'El nivel de la causa no se puede modificar') ??
    (body.parentId !== undefined && (body.parentId ?? null) !== (causa.parentId ?? null)
      ? errores.validacion({ parentId: 'El nodo padre no se puede modificar' })
      : null)
  );
}

/** Reactivar una causa exige que su padre esté activo (si no, quedaría huérfana). */
function reactivacionInvalida(
  todas: readonly NodoCausa[],
  causa: NodoCausa,
  estado: unknown
): Response | null {
  if (estado !== 'activo' || causa.estado === 'activo' || !causa.parentId) return null;
  const padre = todas.find((c) => c.id === causa.parentId);
  return padre && padre.estado !== 'activo'
    ? errores.validacion({ estado: `Activa primero el nodo padre ${padre.codigo}` })
    : null;
}

/** Nº de registros por causa (calculado al consultar) + histórico heredado. */
function conteoPorCausa(registros: readonly { causaId: string }[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const r of registros) conteo.set(r.causaId, (conteo.get(r.causaId) ?? 0) + 1);
  return conteo;
}

function conParadasHistoricas(c: CausaParada, conteo: Map<string, number>): CausaParada {
  return { ...c, paradasHistoricas: (conteo.get(c.id) ?? 0) + (c.paradasHistoricas ?? 0) };
}

function conMermasHistoricas(c: CausaMerma, conteo: Map<string, number>): CausaMerma {
  return { ...c, mermasHistoricas: (conteo.get(c.id) ?? 0) + (c.mermasHistoricas ?? 0) };
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
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      texto(body.codigo).trim(),
      /^[A-Z]{3,4}-[A-Z]?\d{1,2}$/,
      'Formato esperado LLEN-M2, EXTR-2 o MOLD-A3'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    exigirTexto(detalles, 'nombreCorto', body.nombreCorto, 2, 'El nombre corto es obligatorio');
    if (!TIPOS_PROCESO_LINEA.includes(body.tipoProceso as TipoProcesoLinea)) {
      detalles.tipoProceso = 'Selecciona el tipo de proceso';
    }
    if (body.capacidadUnidadesMin !== undefined) {
      exigirRango(
        detalles,
        'capacidadUnidadesMin',
        body.capacidadUnidadesMin,
        0,
        CAPACIDAD_LINEA_MAX,
        'Debe ser 0 o mayor',
        `Máximo ${CAPACIDAD_LINEA_MAX.toLocaleString('es-PE')} u/min`
      );
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo).trim();
    const id = `LIN-${codigo}`;
    const ocupada = altaOcupada(store.lineas, id, codigo, 'una línea');
    if (ocupada) return ocupada;
    const nueva: Linea = {
      id,
      codigo,
      nombre: texto(body.nombre).trim(),
      nombreCorto: texto(body.nombreCorto).trim(),
      tipoProceso: body.tipoProceso as TipoProcesoLinea,
      estado: (body.estado as EstadoCatalogo | undefined) ?? 'activo',
      capacidadUnidadesMin: Number(body.capacidadUnidadesMin ?? 0),
      version: 1,
    };
    store.lineas.push(nueva);
    return HttpResponse.json(nueva, { status: 201 });
  }),

  /** El código es inmutable; pasar a `inactivo` da de baja los pares de la línea. */
  http.patch(`${API}/lineas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const linea = store.lineas.find((l) => l.id === params.id);
    if (!linea) return noEncontrado('Línea no encontrada');
    const body = (await request.json()) as Record<string, unknown>;
    const invalido =
      inmutable(
        'codigo',
        linea.codigo,
        body.codigo,
        'El código de la línea no se puede modificar: lo referencian órdenes y paradas'
      ) ??
      rechazarNulos(body, ['nombre', 'nombreCorto', 'tipoProceso', 'estado', 'capacidadUnidadesMin']);
    if (invalido) return invalido;
    const detalles: Detalles = {};
    if (body.nombre !== undefined) exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    if (body.nombreCorto !== undefined) {
      exigirTexto(detalles, 'nombreCorto', body.nombreCorto, 2, 'El nombre corto es obligatorio');
    }
    if (body.capacidadUnidadesMin !== undefined) {
      exigirRango(
        detalles,
        'capacidadUnidadesMin',
        body.capacidadUnidadesMin,
        0,
        CAPACIDAD_LINEA_MAX,
        'Debe ser 0 o mayor',
        `Máximo ${CAPACIDAD_LINEA_MAX.toLocaleString('es-PE')} u/min`
      );
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const pasaAInactiva = linea.estado === 'activo' && body.estado === 'inactivo';
    const conflicto = guardarConVersion(
      linea,
      sinControl(body, 'codigo') as Partial<Linea>,
      body.version
    );
    if (conflicto) return conflicto;
    if (pasaAInactiva) bajaParesDe({ lineaId: linea.id });
    return HttpResponse.json(linea);
  }),

  /** Baja lógica: la línea pasa a `inactivo`, conserva su histórico y da de baja sus pares. */
  http.delete(`${API}/lineas/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const linea = store.lineas.find((l) => l.id === params.id);
    if (!linea) return noEncontrado('Línea no encontrada');
    const conservados =
      store.ordenes.filter((o) => o.lineaId === linea.id).length +
      store.paradas.filter((p) => p.lineaId === linea.id).length;
    if (linea.estado !== 'inactivo') guardarConVersion(linea, { estado: 'inactivo' });
    const pares = bajaParesDe({ lineaId: linea.id });
    const respuesta: BajaLogicaResponse = {
      id: linea.id,
      codigo: linea.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes y paradas',
      mensaje:
        `Hay ${conservados} órdenes y paradas registradas en esta línea; se conservarán con el código ${linea.codigo}.` +
        (pares > 0 ? ` También se dieron de baja ${pares} velocidades estándar de la línea.` : ''),
    };
    return HttpResponse.json(respuesta);
  }),
];

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

/** Espejo de `resolverSabor`: el texto `sabor` sale siempre de `saborId`. */
function resolverSabor(saborId: string | null): string | Response {
  if (!saborId) return '';
  const sabor = getStore().sabores.find((s) => s.id === saborId);
  return sabor ? sabor.nombre : errores.validacion({ saborId: 'El sabor no existe' });
}

/** Validación del alta (y, con `parcial`, de la edición) de producto. */
function validarProducto(body: Record<string, unknown>, parcial = false): Detalles {
  const detalles: Detalles = {};
  const presente = (campo: string) => !parcial || body[campo] !== undefined;
  if (!parcial) {
    exigirPatron(detalles, 'codigo', texto(body.codigo).trim(), /^\d{7}$/, 'Formato esperado 1110001 (7 dígitos)');
  }
  if (presente('descripcionLarga')) {
    exigirTexto(detalles, 'descripcionLarga', body.descripcionLarga, 3, 'La descripción larga es obligatoria');
  }
  if (presente('descripcionCorta')) {
    exigirTexto(detalles, 'descripcionCorta', body.descripcionCorta, 3, 'La descripción corta es obligatoria');
  }
  if (presente('nombre')) exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
  if (presente('pesoKg')) {
    const peso = numero(body.pesoKg);
    if (!(peso > 0)) detalles.pesoKg = 'El peso debe ser mayor que 0';
    else if (peso > 10_000) detalles.pesoKg = 'Peso fuera de rango';
  }
  if (body.unidadesPorCaja !== undefined) {
    const n = numero(body.unidadesPorCaja);
    if (!Number.isInteger(n)) detalles.unidadesPorCaja = 'Debe ser un número entero';
    else if (n < 1) detalles.unidadesPorCaja = 'Debe ser 1 o mayor';
  }
  return detalles;
}

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
      /* Par producto × línea activo y producto activo (espejo de `listarProductos`). */
      const conPar = new Set(
        store.velocidadesEstandar
          .filter((v) => v.lineaId === lineaId && v.estado === 'activo')
          .map((v) => v.productoId)
      );
      filas = filas.filter((p) => conPar.has(p.id) && p.estado === 'activo');
    }
    if (estado) filas = filas.filter((p) => p.estado === estado);
    if (search) {
      const buscado = normalizar(search);
      filas = filas.filter((p) =>
        [p.codigo, p.nombre, p.descripcionCorta, p.descripcionLarga, p.alias ?? '', p.sabor ?? '']
          .map(normalizar)
          .some((campo) => campo.includes(buscado))
      );
    }
    return HttpResponse.json({ data: filas });
  }),

  http.post(`${API}/productos`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const body = (await request.json()) as Record<string, unknown>;

    const detalles = validarProducto(body);
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo).trim();
    const id = `PRD-${codigo}`;
    const ocupado = altaOcupada(store.productos, id, codigo, 'un producto');
    if (ocupado) return ocupado;
    const saborId = (body.saborId as string | null | undefined) ?? null;
    const sabor = saborId ? resolverSabor(saborId) : texto(body.sabor);
    if (sabor instanceof Response) return sabor;

    const producto: Producto = {
      id,
      codigo,
      nombre: texto(body.nombre).trim(),
      descripcionLarga: texto(body.descripcionLarga).trim(),
      descripcionCorta: texto(body.descripcionCorta).trim(),
      alias: body.alias === undefined ? null : (body.alias as string | null),
      marca: body.marca === undefined ? null : (body.marca as string | null),
      presentacion: body.presentacion === undefined ? null : (body.presentacion as string | null),
      unidadesPorCaja: body.unidadesPorCaja === undefined ? 1 : numero(body.unidadesPorCaja),
      pesoKg: numero(body.pesoKg),
      saborId,
      sabor,
      estado: (body.estado as EstadoCatalogo | undefined) ?? 'activo',
      version: 1,
    };
    store.productos.push(producto);
    return HttpResponse.json(producto, { status: 201 });
  }),

  /** El código es inmutable; pasar a `inactivo` da de baja sus pares. */
  http.patch(`${API}/productos/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const producto = store.productos.find((p) => p.id === params.id);
    if (!producto) return noEncontrado('Producto no encontrado');
    const body = (await request.json()) as Record<string, unknown>;
    const invalido =
      inmutable(
        'codigo',
        producto.codigo,
        body.codigo,
        'El código del producto no se puede modificar: lo referencian las órdenes'
      ) ??
      rechazarNulos(body, [
        'nombre',
        'descripcionLarga',
        'descripcionCorta',
        'unidadesPorCaja',
        'pesoKg',
        'estado',
        'sabor',
      ]);
    if (invalido) return invalido;
    const detalles = validarProducto(body, true);
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const cambios = sinControl(body, 'codigo') as Partial<Producto>;
    if (body.saborId !== undefined) {
      const sabor = resolverSabor((body.saborId as string | null) ?? null);
      if (sabor instanceof Response) return sabor;
      cambios.sabor = sabor;
    }
    const pasaAInactivo = producto.estado === 'activo' && body.estado === 'inactivo';
    const conflicto = guardarConVersion(producto, cambios, body.version);
    if (conflicto) return conflicto;
    if (pasaAInactivo) bajaParesDe({ productoId: producto.id });
    return HttpResponse.json(producto);
  }),

  /** Baja lógica (sólo jefe): el producto pasa a `inactivo`, conserva sus órdenes y da de baja sus pares. */
  http.delete(`${API}/productos/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe');
    if (prohibido) return prohibido;
    const store = getStore();
    const producto = store.productos.find((p) => p.id === params.id);
    if (!producto) return noEncontrado('Producto no encontrado');
    const conservados = store.ordenes.filter((o) => o.productoId === producto.id).length;
    if (producto.estado !== 'inactivo') guardarConVersion(producto, { estado: 'inactivo' });
    const pares = bajaParesDe({ productoId: producto.id });
    const respuesta: BajaLogicaResponse = {
      id: producto.id,
      codigo: producto.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'órdenes',
      mensaje:
        `Hay ${conservados} órdenes con este producto; se conservarán con el código ${producto.codigo}.` +
        (pares > 0 ? ` También se dieron de baja sus ${pares} velocidades estándar.` : ''),
    };
    return HttpResponse.json(respuesta);
  }),
];

/* ------------------------------------------------------------------ */
/* Velocidades estándar (pares producto × línea)                       */
/* ------------------------------------------------------------------ */

function enriquecerPar(par: VelocidadEstandar): VelocidadEstandarListItem {
  const store = getStore();
  const producto = store.productos.find((p) => p.id === par.productoId);
  const linea = store.lineas.find((l) => l.id === par.lineaId);
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

/**
 * Espejo de `verificarProductoYLinea`: producto y línea deben existir y, si el
 * par queda activo, estar activos (422).
 */
function productoYLineaInvalidos(productoId: string, lineaId: string, exigirActivos: boolean): Response | null {
  const store = getStore();
  const producto = store.productos.find((p) => p.id === productoId);
  const linea = store.lineas.find((l) => l.id === lineaId);
  if (!producto) return errores.validacion({ productoId: 'El producto no existe' });
  if (!linea) return errores.validacion({ lineaId: 'La línea no existe' });
  if (!exigirActivos) return null;
  if (producto.estado !== 'activo') {
    return errores.validacion({ productoId: 'El producto está inactivo; actívalo primero' });
  }
  if (linea.estado !== 'activo') {
    return errores.validacion({ lineaId: 'La línea está inactiva; actívala primero' });
  }
  return null;
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
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
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
    if (body.mermaEstandarPct !== undefined) {
      exigirRango(detalles, 'mermaEstandarPct', body.mermaEstandarPct, 0, 100, 'Debe ser 0 o mayor', 'No puede superar 100 %');
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const productoId = texto(body.productoId);
    const lineaId = texto(body.lineaId);
    const estado = (body.estado as EstadoCatalogo | undefined) ?? 'activo';
    if (
      store.velocidadesEstandar.some((v) => v.productoId === productoId && v.lineaId === lineaId)
    ) {
      return errores.conflicto('Ya existe una velocidad para ese producto y línea', {
        productoId,
        lineaId,
      });
    }
    const invalidos = productoYLineaInvalidos(productoId, lineaId, estado === 'activo');
    if (invalidos) return invalidos;

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
      estado,
      version: 1,
    };
    store.velocidadesEstandar.push(par);
    return HttpResponse.json(par, { status: 201 });
  }),

  http.patch(`${API}/velocidades-estandar/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const par = store.velocidadesEstandar.find((v) => v.id === params.id);
    if (!par) return noEncontrado('Velocidad estándar no encontrada');
    const body = (await request.json()) as Record<string, unknown>;
    const nulos = rechazarNulos(body, ['productoId', 'lineaId', 'velocidadUnidHora', 'mermaEstandarPct', 'estado']);
    if (nulos) return nulos;
    const detalles: Detalles = {};
    if (body.velocidadUnidHora !== undefined) {
      exigirRango(detalles, 'velocidadUnidHora', body.velocidadUnidHora, 1, 60_000, 'Debe ser mayor que 0', 'Velocidad fuera de rango');
    }
    if (body.mermaEstandarPct !== undefined) {
      exigirRango(detalles, 'mermaEstandarPct', body.mermaEstandarPct, 0, 100, 'Debe ser 0 o mayor', 'No puede superar 100 %');
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const productoId = texto(body.productoId) || par.productoId;
    const lineaId = texto(body.lineaId) || par.lineaId;
    const estado = (body.estado as EstadoCatalogo | undefined) ?? par.estado;
    const cambiaPar = productoId !== par.productoId || lineaId !== par.lineaId;
    const seActiva = estado === 'activo' && (par.estado !== 'activo' || cambiaPar);
    if (cambiaPar || seActiva) {
      const invalidos = productoYLineaInvalidos(productoId, lineaId, estado === 'activo');
      if (invalidos) return invalidos;
    }
    if (cambiaPar) {
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

    const cambios = sinControl(body) as Partial<VelocidadEstandar>;
    if (body.velocidadUnidHora !== undefined) {
      cambios.velocidadUnidMin = unidadesPorMinuto(numero(body.velocidadUnidHora));
    }
    const conflicto = guardarConVersion(par, cambios, body.version);
    if (conflicto) return conflicto;
    return HttpResponse.json(par);
  }),

  /** Baja lógica (sólo jefe): el par pasa a `inactivo`; las órdenes conservan su valor. */
  http.delete(`${API}/velocidades-estandar/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe');
    if (prohibido) return prohibido;
    const store = getStore();
    const par = store.velocidadesEstandar.find((v) => v.id === params.id);
    if (!par) return noEncontrado('Velocidad estándar no encontrada');
    const conservados = store.ordenes.filter((o) => o.velocidadEstandarId === par.id).length;
    if (par.estado !== 'inactivo') guardarConVersion(par, { estado: 'inactivo' });
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
    const store = getStore();
    const conteo = conteoPorCausa(store.paradas);
    let causas = [...store.causasParada]
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map((c) => conParadasHistoricas(c, conteo));
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
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const body = (await request.json()) as Partial<CausaParada>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      texto(body.codigo).trim(),
      /^P[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/,
      'Formato esperado PP-01, PP-01-A o PP-01-01'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    if (!NIVELES_CAUSA.includes(body.nivel as CausaParada['nivel'])) {
      detalles.nivel = 'Selecciona el nivel de la causa';
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo).trim();
    const id = `CPA-${codigo}`;
    const ocupada = altaOcupada(store.causasParada, id, codigo, 'una causa');
    if (ocupada) return ocupada;
    const parentId = body.parentId ?? null;
    const padre = parentId ? store.causasParada.find((c) => c.id === parentId) : undefined;
    const jerarquia = validarJerarquia(body.nivel!, codigo, padre, NIVELES_CAUSA, parentId);
    if (jerarquia) return jerarquia;

    const nueva: CausaParada = {
      id,
      codigo,
      nombre: texto(body.nombre).trim(),
      nivel: body.nivel!,
      parentId,
      /* La clasificación se hereda del tipo: una hija de PP-01 nunca queda imprevista. */
      clasificacion: padre ? padre.clasificacion : (body.clasificacion ?? 'imprevista'),
      afectaOee: body.afectaOee ?? true,
      requiereEvidencia: body.requiereEvidencia ?? false,
      requiereSolicitud: body.requiereSolicitud ?? false,
      tiempoEstandarMin: body.tiempoEstandarMin ?? 0,
      lineasAplicables: body.lineasAplicables ?? [],
      estado: body.estado ?? 'activo',
      paradasHistoricas: 0,
      codigoLegado: body.codigoLegado ?? null,
      version: 1,
    };
    store.causasParada.push(nueva);
    return HttpResponse.json(nueva, { status: 201 });
  }),

  /**
   * Código, nivel y padre son inmutables. La clasificación sólo se edita en un
   * tipo y se propaga al subárbol; pasar a `inactivo` da de baja el subárbol.
   */
  http.patch(`${API}/causas-parada/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const causa = store.causasParada.find((c) => c.id === params.id);
    if (!causa) return noEncontrado('Causa de parada no encontrada');
    const body = (await request.json()) as Record<string, unknown>;
    const invalido =
      posicionInmutable(causa, body) ??
      rechazarNulos(body, [
        'nombre',
        'clasificacion',
        'afectaOee',
        'requiereEvidencia',
        'requiereSolicitud',
        'tiempoEstandarMin',
        'lineasAplicables',
        'estado',
      ]);
    if (invalido) return invalido;
    if (body.nombre !== undefined && texto(body.nombre).trim().length < 3) {
      return errores.validacion({ nombre: 'El nombre es obligatorio' });
    }
    const cambiaClasificacion =
      body.clasificacion !== undefined && body.clasificacion !== causa.clasificacion;
    if (cambiaClasificacion && causa.nivel !== 'tipo') {
      return errores.validacion({
        clasificacion: 'La clasificación se hereda del tipo; cámbiala en el tipo raíz',
      });
    }
    const reactivacion = reactivacionInvalida(store.causasParada, causa, body.estado);
    if (reactivacion) return reactivacion;
    const pasaAInactiva = causa.estado === 'activo' && body.estado === 'inactivo';

    const conflicto = guardarConVersion(
      causa,
      sinControl(body, 'codigo', 'nivel', 'parentId') as Partial<CausaParada>,
      body.version
    );
    if (conflicto) return conflicto;
    if (cambiaClasificacion || pasaAInactiva) {
      for (const hija of descendientes(store.causasParada, causa.id)) {
        const cambios: Partial<CausaParada> = {};
        if (cambiaClasificacion && hija.clasificacion !== causa.clasificacion) {
          cambios.clasificacion = causa.clasificacion;
        }
        if (pasaAInactiva && hija.estado !== 'inactivo') cambios.estado = 'inactivo';
        if (Object.keys(cambios).length > 0) guardarConVersion(hija, cambios);
      }
    }
    return HttpResponse.json(conParadasHistoricas(causa, conteoPorCausa(store.paradas)));
  }),

  /** Baja lógica: la causa y su subárbol pasan a `inactivo`; nunca se borran. */
  http.delete(`${API}/causas-parada/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const causa = store.causasParada.find((c) => c.id === params.id);
    if (!causa) return noEncontrado('Causa de parada no encontrada');
    const conservados =
      store.paradas.filter((p) => p.causaId === causa.id).length + causa.paradasHistoricas;
    const hijas = bajaSubarbol(store.causasParada, causa);
    const respuesta: BajaCausaParadaResponse = {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      paradasConservadas: conservados,
      etiquetaConservados: 'paradas',
      mensaje:
        `Hay ${conservados} paradas históricas con esta causa; se conservarán con el código ${causa.codigo}.` +
        (hijas > 0 ? ` También se dieron de baja ${hijas} causas que dependían de ella.` : ''),
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
    const store = getStore();
    const conteo = conteoPorCausa(store.mermas);

    let causas = [...store.causasMerma]
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map((c) => conMermasHistoricas(c, conteo));
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
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const body = (await request.json()) as Partial<CausaMerma>;

    const detalles: Detalles = {};
    exigirPatron(
      detalles,
      'codigo',
      texto(body.codigo).trim(),
      /^M[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/,
      'Formato esperado MP-01, MP-01-A o MP-01-01'
    );
    exigirTexto(detalles, 'nombre', body.nombre, 3, 'El nombre es obligatorio');
    if (!NIVELES_CAUSA_MERMA.includes(body.nivel as CausaMerma['nivel'])) {
      detalles.nivel = 'Selecciona el nivel de la causa';
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);

    const codigo = texto(body.codigo).trim();
    const id = `CME-${codigo}`;
    const ocupada = altaOcupada(store.causasMerma, id, codigo, 'una causa');
    if (ocupada) return ocupada;
    const parentId = body.parentId ?? null;
    const padre = parentId ? store.causasMerma.find((c) => c.id === parentId) : undefined;
    const jerarquia = validarJerarquia(body.nivel!, codigo, padre, NIVELES_CAUSA_MERMA, parentId);
    if (jerarquia) return jerarquia;

    const nueva: CausaMerma = {
      id,
      codigo,
      nombre: texto(body.nombre).trim(),
      nivel: body.nivel!,
      parentId,
      aplicaA: body.aplicaA ?? [],
      lineasAplicables: body.lineasAplicables ?? [],
      requiereEvidencia: body.requiereEvidencia ?? false,
      requiereComentario: body.requiereComentario ?? false,
      requiereSolicitud: body.requiereSolicitud ?? false,
      estado: body.estado ?? 'activo',
      mermasHistoricas: 0,
      version: 1,
    };
    store.causasMerma.push(nueva);
    return HttpResponse.json(nueva, { status: 201 });
  }),

  /** Código, nivel y padre son inmutables; pasar a `inactivo` da de baja el subárbol. */
  http.patch(`${API}/causas-merma/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const causa = store.causasMerma.find((c) => c.id === params.id);
    if (!causa) return noEncontrado('Causa de merma no encontrada');
    const body = (await request.json()) as Record<string, unknown>;
    const invalido =
      posicionInmutable(causa, body) ??
      rechazarNulos(body, [
        'nombre',
        'aplicaA',
        'lineasAplicables',
        'requiereEvidencia',
        'requiereComentario',
        'requiereSolicitud',
        'estado',
      ]);
    if (invalido) return invalido;
    if (body.nombre !== undefined && texto(body.nombre).trim().length < 3) {
      return errores.validacion({ nombre: 'El nombre es obligatorio' });
    }
    const reactivacion = reactivacionInvalida(store.causasMerma, causa, body.estado);
    if (reactivacion) return reactivacion;
    const pasaAInactiva = causa.estado === 'activo' && body.estado === 'inactivo';

    const conflicto = guardarConVersion(
      causa,
      sinControl(body, 'codigo', 'nivel', 'parentId') as Partial<CausaMerma>,
      body.version
    );
    if (conflicto) return conflicto;
    if (pasaAInactiva) {
      for (const hija of descendientes(store.causasMerma, causa.id)) {
        if (hija.estado !== 'inactivo') guardarConVersion(hija, { estado: 'inactivo' });
      }
    }
    return HttpResponse.json(conMermasHistoricas(causa, conteoPorCausa(store.mermas)));
  }),

  /** Baja lógica: la causa y su subárbol pasan a `inactivo`; conservan sus mermas. */
  http.delete(`${API}/causas-merma/:id`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const prohibido = exigeRol(request, 'jefe', 'supervisor');
    if (prohibido) return prohibido;
    const store = getStore();
    const causa = store.causasMerma.find((c) => c.id === params.id);
    if (!causa) return noEncontrado('Causa de merma no encontrada');
    const conservados =
      store.mermas.filter((m) => m.causaId === causa.id).length + causa.mermasHistoricas;
    const hijas = bajaSubarbol(store.causasMerma, causa);
    const respuesta: BajaLogicaResponse = {
      id: causa.id,
      codigo: causa.codigo,
      estado: 'inactivo',
      conservados,
      etiquetaConservados: 'mermas',
      mensaje:
        `Hay ${conservados} mermas históricas con esta causa; se conservarán con el código ${causa.codigo}.` +
        (hijas > 0 ? ` También se dieron de baja ${hijas} causas que dependían de ella.` : ''),
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
