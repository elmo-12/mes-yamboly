#!/usr/bin/env node
/**
 * Extrae los catalogos maestros REALES de la planta Yamboly desde un dump de
 * Postgres (formato custom de pg_dump, Strapi v5) y los deja como JSON
 * commiteables en apps/api/src/database/seeds/data/real/.
 *
 * Tarea de UN SOLO USO. No depende de ningun paquete externo (tsx no estaba
 * disponible en node_modules al momento de escribir este script), por lo que
 * se implementa en JavaScript puro (ESM) usando solo modulos nativos de Node.
 *
 * Uso:
 *   node apps/api/scripts/extraer-maestros.mjs
 *
 * Requiere que `pg_restore` (formato custom) este disponible en la ruta
 * configurada abajo (PG_RESTORE_BIN). No se restaura ninguna base de datos:
 * solo se lee el dump en modo texto ("pg_restore -a -t <tabla> -f -").
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

const DUMP_PATH =
  '/Users/elmo/trabajo/yambo/backups/sitemaster_PRE-TIEMPOS-ESTANDAR_20260827_134101.dump';
const PG_RESTORE_BIN = '/opt/homebrew/opt/libpq/bin/pg_restore';
const OUT_DIR = join(
  __dirname,
  '..',
  'src',
  'database',
  'seeds',
  'data',
  'real',
);

// Tablas que se leen del dump.
const TABLAS_ENTIDAD = [
  'lineas',
  'sabores',
  'productos',
  'producto_lineas',
  'tipo_paradas',
  'categoria_generals',
  'categoria_especificas',
  'merma_tipo_produccions',
  'merma_clasificacions',
  'merma_causas',
];

const TABLAS_LINK = [
  'producto_lineas_producto_lnk',
  'producto_lineas_linea_lnk',
  'categoria_especificas_categoria_general_lnk',
  'categoria_generals_tipo_parada_lnk',
  'merma_causas_merma_tipo_produccion_lnk',
  'merma_causas_merma_clasificacion_lnk',
  'merma_causas_lineas_lnk',
];

// ---------------------------------------------------------------------------
// Utilidades de parseo del formato COPY (texto) de Postgres
// ---------------------------------------------------------------------------

/** Ejecuta pg_restore -a -t <tabla> -f - contra el dump y devuelve el texto. */
function extraerTablaCruda(nombreTabla) {
  const resultado = spawnSync(
    PG_RESTORE_BIN,
    ['-a', '-t', nombreTabla, '-f', '-', DUMP_PATH],
    { maxBuffer: 1024 * 1024 * 200, encoding: 'utf8' },
  );
  if (resultado.status !== 0) {
    throw new Error(
      `pg_restore fallo para la tabla "${nombreTabla}": ${resultado.stderr}`,
    );
  }
  return resultado.stdout;
}

/** Revierte el escape de texto usado por el formato COPY de Postgres. */
function desescaparValorCopy(crudo) {
  if (crudo === '\\N') return null;
  let resultado = '';
  for (let i = 0; i < crudo.length; i += 1) {
    const c = crudo[i];
    if (c === '\\' && i + 1 < crudo.length) {
      const siguiente = crudo[i + 1];
      i += 1;
      switch (siguiente) {
        case 't':
          resultado += '\t';
          break;
        case 'n':
          resultado += '\n';
          break;
        case 'r':
          resultado += '\r';
          break;
        case 'b':
          resultado += '\b';
          break;
        case 'f':
          resultado += '\f';
          break;
        case 'v':
          resultado += '\v';
          break;
        case '\\':
          resultado += '\\';
          break;
        default:
          resultado += siguiente;
      }
    } else {
      resultado += c;
    }
  }
  return resultado;
}

/**
 * Parsea el bloque `COPY public.<tabla> (col1, col2, ...) FROM stdin; ... \.`
 * y devuelve un arreglo de objetos {columna: valor|null}.
 */
function parsearBloqueCopy(textoCompleto, nombreTabla) {
  const lineas = textoCompleto.split('\n');
  const prefijoCopy = `COPY public.${nombreTabla} (`;
  let indiceInicio = -1;
  let columnas = [];
  for (let i = 0; i < lineas.length; i += 1) {
    if (lineas[i].startsWith(prefijoCopy)) {
      indiceInicio = i;
      const dentroParentesis = lineas[i].slice(
        prefijoCopy.length,
        lineas[i].indexOf(') FROM stdin;'),
      );
      columnas = dentroParentesis.split(', ').map((c) => c.trim());
      break;
    }
  }
  if (indiceInicio === -1) {
    throw new Error(
      `No se encontro la sentencia COPY para la tabla "${nombreTabla}"`,
    );
  }

  const filas = [];
  for (let i = indiceInicio + 1; i < lineas.length; i += 1) {
    const linea = lineas[i];
    if (linea === '\\.') break;
    if (linea === '') continue;
    const camposCrudos = linea.split('\t');
    if (camposCrudos.length !== columnas.length) {
      throw new Error(
        `Fila con numero de columnas inesperado en "${nombreTabla}": ${linea}`,
      );
    }
    const fila = {};
    columnas.forEach((col, idx) => {
      fila[col] = desescaparValorCopy(camposCrudos[idx]);
    });
    filas.push(fila);
  }
  return filas;
}

/** Carga y parsea una tabla completa del dump. */
function cargarTabla(nombreTabla) {
  const texto = extraerTablaCruda(nombreTabla);
  return parsearBloqueCopy(texto, nombreTabla);
}

// ---------------------------------------------------------------------------
// Deduplicacion por document_id (borrador vs publicado, Strapi v5)
// ---------------------------------------------------------------------------

/**
 * Deduplica filas por document_id, quedandose con la fila publicada
 * (published_at no nulo); si ninguna esta publicada, con la mas reciente
 * (updated_at). Devuelve tambien un resolvedor que mapea CUALQUIER id de fila
 * (borrador o publicado) al id de la fila canonica sobreviviente, para poder
 * resolver las tablas *_lnk que pueden referenciar el id de un borrador.
 */
function deduplicarPorDocumentId(filas) {
  const porDocumento = new Map();
  for (const fila of filas) {
    const docId = fila.document_id;
    const existente = porDocumento.get(docId);
    if (!existente) {
      porDocumento.set(docId, fila);
      continue;
    }
    const existentePublicada = existente.published_at !== null;
    const filaPublicada = fila.published_at !== null;
    if (filaPublicada && !existentePublicada) {
      porDocumento.set(docId, fila);
    } else if (filaPublicada === existentePublicada) {
      // Empate: nos quedamos con la mas reciente por updated_at.
      if (new Date(fila.updated_at) > new Date(existente.updated_at)) {
        porDocumento.set(docId, fila);
      }
    }
    // si existente ya esta publicada y fila no, se conserva existente.
  }

  const canonicaPorId = new Map(); // id de fila (canonica) -> fila
  for (const fila of porDocumento.values()) {
    canonicaPorId.set(fila.id, fila);
  }

  const documentoPorId = new Map(); // id de CUALQUIER fila (borrador o publicada) -> document_id
  for (const fila of filas) {
    documentoPorId.set(fila.id, fila.document_id);
  }

  /** Resuelve un id de fila (borrador o publicado) a la fila canonica, o undefined. */
  function resolver(id) {
    const docId = documentoPorId.get(id);
    if (docId === undefined) return undefined;
    return porDocumento.get(docId);
  }

  return {
    filas: [...porDocumento.values()],
    resolver,
    totalCrudo: filas.length,
    totalDeduplicado: porDocumento.size,
  };
}

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

/** Convierte a Title Case respetando acentos y la letra n~. */
function tituloDesde(texto) {
  return texto
    .toLowerCase()
    .split(' ')
    .map((palabra) =>
      palabra.length === 0
        ? palabra
        : palabra[0].toUpperCase() + palabra.slice(1),
    )
    .join(' ');
}

/** Normaliza a mayusculas sin tildes, para comparaciones/heuristicas. */
function normalizarMayusSinTildes(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Colapsa espacios repetidos y recorta. */
function limpiarEspacios(texto) {
  return texto.replace(/\s+/g, ' ').trim();
}

/** "Sentence case" simple: solo la primera letra en mayuscula, el resto igual. */
function oracionDesde(texto) {
  const limpio = limpiarEspacios(texto);
  if (limpio.length === 0) return limpio;
  return limpio[0].toUpperCase() + limpio.slice(1);
}

const comparadorEs = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Devuelve null si el codigo legado es nulo o cadena vacia. */
function codigoLegadoOnull(valor) {
  if (valor === null) return null;
  const limpio = valor.trim();
  return limpio.length === 0 ? null : limpio;
}

// ---------------------------------------------------------------------------
// Carga de tablas
// ---------------------------------------------------------------------------

console.log('Leyendo tablas del dump con pg_restore (modo texto, sin restaurar)...');

const tablasCrudas = {};
for (const t of [...TABLAS_ENTIDAD, ...TABLAS_LINK]) {
  tablasCrudas[t] = cargarTabla(t);
  console.log(`  - ${t}: ${tablasCrudas[t].length} filas`);
}

const reporte = {
  descartes: [],
  anomalias: [],
};

const entidades = {};
for (const t of TABLAS_ENTIDAD) {
  const dedup = deduplicarPorDocumentId(tablasCrudas[t]);
  entidades[t] = dedup;
  if (dedup.totalCrudo !== dedup.totalDeduplicado) {
    reporte.anomalias.push(
      `${t}: se deduplicaron ${dedup.totalCrudo - dedup.totalDeduplicado} filas por document_id ` +
        `(${dedup.totalCrudo} crudas -> ${dedup.totalDeduplicado} unicas)`,
    );
  }
}

// Mapas de acceso directo por id canonico (postgres id de la fila sobreviviente).
const lineasPorId = new Map(entidades.lineas.filas.map((f) => [f.id, f]));
const saboresPorId = new Map(entidades.sabores.filas.map((f) => [f.id, f]));
const productosPorId = new Map(entidades.productos.filas.map((f) => [f.id, f]));
const productoLineasPorId = new Map(
  entidades.producto_lineas.filas.map((f) => [f.id, f]),
);
const tipoParadasPorId = new Map(entidades.tipo_paradas.filas.map((f) => [f.id, f]));
const categoriaGeneralsPorId = new Map(
  entidades.categoria_generals.filas.map((f) => [f.id, f]),
);
const categoriaEspecificasPorId = new Map(
  entidades.categoria_especificas.filas.map((f) => [f.id, f]),
);
const mermaTipoProduccionsPorId = new Map(
  entidades.merma_tipo_produccions.filas.map((f) => [f.id, f]),
);
const mermaClasificacionsPorId = new Map(
  entidades.merma_clasificacions.filas.map((f) => [f.id, f]),
);
const mermaCausasPorId = new Map(entidades.merma_causas.filas.map((f) => [f.id, f]));

// ---------------------------------------------------------------------------
// 1) LINEAS
// ---------------------------------------------------------------------------

const TIPO_PROCESO_POR_PREFIJO = {
  LLENADORA: 'llenadora',
  EXTRUSORA: 'extrusora',
  MOLDEADORA: 'moldeadora',
};

function codigoLinea(nombreCorto) {
  return nombreCorto.trim().replace(/\s+/g, '-');
}

const lineasJson = entidades.lineas.filas
  .map((f) => {
    const codigo = codigoLinea(f.nombre_corto);
    const prefijo = f.nombre.split(' ')[0];
    const tipoProceso = TIPO_PROCESO_POR_PREFIJO[prefijo];
    if (!tipoProceso) {
      reporte.anomalias.push(
        `linea id=${f.id} nombre="${f.nombre}": no se pudo inferir tipoProceso (prefijo "${prefijo}" desconocido)`,
      );
    }
    return {
      id: `LIN-${codigo}`,
      codigo,
      nombre: tituloDesde(f.nombre),
      nombreCorto: f.nombre_corto,
      tipoProceso: tipoProceso ?? 'llenadora',
      idLegado: Number(f.id),
      estado: 'activo',
    };
  })
  .sort((a, b) => comparadorEs(a.nombre, b.nombre));

const lineaIdsValidos = new Set(lineasJson.map((l) => l.id));
// Mapa: id postgres de linea -> id LIN-... (para resolver los pares producto x linea)
const lineaLegadoAJson = new Map(lineasJson.map((l) => [String(l.idLegado), l]));

// ---------------------------------------------------------------------------
// 2) (sin sedes) — la aplicacion opera una unica sede (Lima), asi que el dump
//    de sedes ya no se extrae ni se siembra.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3) SABORES
// ---------------------------------------------------------------------------

const saboresJson = entidades.sabores.filas
  .map((f) => ({
    id: `SAB-${f.codigo}`,
    codigo: f.codigo,
    nombre: tituloDesde(f.nombre),
    estado: 'activo',
    _nombreNormalizado: normalizarMayusSinTildes(f.nombre),
  }))
  .sort((a, b) => a.codigo.localeCompare(b.codigo));

// Lista para la heuristica de match: nombres normalizados mas largos primero.
const saboresParaMatch = [...saboresJson].sort(
  (a, b) => b._nombreNormalizado.length - a._nombreNormalizado.length,
);

function resolverSaborDesdeDescripcion(descripcionLarga) {
  const normDesc = normalizarMayusSinTildes(descripcionLarga);
  for (const sabor of saboresParaMatch) {
    if (normDesc.includes(sabor._nombreNormalizado)) {
      return sabor;
    }
  }
  return null;
}

// Quitamos el campo auxiliar antes de escribir el JSON final.
const saboresJsonLimpio = saboresJson.map(({ _nombreNormalizado, ...resto }) => resto);
const saboresIdsValidos = new Set(saboresJsonLimpio.map((s) => s.id));

// ---------------------------------------------------------------------------
// 4) VELOCIDADES ESTANDAR (pares producto x linea) + 5) PRODUCTOS
// ---------------------------------------------------------------------------

// Resolvers de las tablas de link producto_lineas <-> producto / linea.
const productoLineaAProducto = new Map();
for (const fila of tablasCrudas.producto_lineas_producto_lnk) {
  productoLineaAProducto.set(fila.producto_linea_id, fila.producto_id);
}
const productoLineaALinea = new Map();
for (const fila of tablasCrudas.producto_lineas_linea_lnk) {
  productoLineaALinea.set(fila.producto_linea_id, fila.linea_id);
}

const paresConProductoActivo = new Map(); // productoCodigo -> true si tiene al menos 1 par activo

const velocidadesCrudas = [];
for (const pl of entidades.producto_lineas.filas) {
  const idProductoCrudo = productoLineaAProducto.get(pl.id);
  const idLineaCrudo = productoLineaALinea.get(pl.id);

  if (idProductoCrudo === undefined) {
    reporte.descartes.push(
      `producto_lineas id=${pl.id}: sin link a producto (producto_lineas_producto_lnk) -> descartado`,
    );
    continue;
  }
  if (idLineaCrudo === undefined) {
    reporte.descartes.push(
      `producto_lineas id=${pl.id}: sin link a linea (producto_lineas_linea_lnk) -> descartado`,
    );
    continue;
  }

  const producto = entidades.productos.resolver(idProductoCrudo);
  const linea = entidades.lineas.resolver(idLineaCrudo);

  if (!producto) {
    reporte.descartes.push(
      `producto_lineas id=${pl.id}: el producto referenciado (id crudo ${idProductoCrudo}) no existe tras deduplicar -> descartado`,
    );
    continue;
  }
  if (!linea) {
    reporte.descartes.push(
      `producto_lineas id=${pl.id}: la linea referenciada (id crudo ${idLineaCrudo}) no existe tras deduplicar -> descartado`,
    );
    continue;
  }

  const lineaJson = lineaLegadoAJson.get(linea.id);
  if (!lineaJson) {
    reporte.descartes.push(
      `producto_lineas id=${pl.id}: la linea resuelta (id ${linea.id}) no esta en lineas.json -> descartado`,
    );
    continue;
  }

  const velocidadUnidHora = Number(pl.velocidad_estandar);
  const activo = pl.estado === 't';

  velocidadesCrudas.push({
    productoCodigo: producto.codigo,
    lineaId: lineaJson.id,
    velocidadUnidHora,
    velocidadUnidMin: Math.round((velocidadUnidHora / 60) * 10) / 10,
    mermaEstandarPct: pl.merma !== null ? Number(pl.merma) : 0,
    cipMin: pl.cip !== null ? Number(pl.cip) : null,
    arranqueMin: pl.arranque !== null ? Number(pl.arranque) : null,
    estado: activo ? 'activo' : 'inactivo',
    _productoEstadoActivo: producto.estado === 't',
  });

  if (activo && producto.estado === 't') {
    paresConProductoActivo.set(producto.codigo, true);
  }
}

velocidadesCrudas.sort(
  (a, b) =>
    a.productoCodigo.localeCompare(b.productoCodigo) ||
    a.lineaId.localeCompare(b.lineaId),
);

const velocidadesEstandarJson = velocidadesCrudas.map((v, idx) => {
  const { _productoEstadoActivo, ...resto } = v;
  return {
    id: `VE-${String(idx + 1).padStart(4, '0')}`,
    ...resto,
  };
});

// Cuantos pares referencian un producto que quedara fuera de productos.json
// (porque el producto esta inactivo). Es una situacion esperada, no un error.
const paresConProductoInactivo = velocidadesCrudas.filter(
  (v) => !v._productoEstadoActivo,
);
if (paresConProductoInactivo.length > 0) {
  reporte.anomalias.push(
    `${paresConProductoInactivo.length} pares en velocidades-estandar.json referencian un producto con estado=false ` +
      `(no apareceran en productos.json): ${paresConProductoInactivo
        .map((v) => `${v.productoCodigo}@${v.lineaId}`)
        .join(', ')}`,
  );
}

// --- Productos -------------------------------------------------------------

function valorONull(valor) {
  if (valor === null) return null;
  const limpio = valor.trim();
  return limpio.length === 0 ? null : limpio;
}

const productosResueltos = [];
const productosSinSabor = [];

for (const p of entidades.productos.filas) {
  if (p.estado !== 't') continue;
  if (!paresConProductoActivo.has(p.codigo)) continue;

  const sabor = resolverSaborDesdeDescripcion(p.descripcion_larga);
  if (!sabor) {
    productosSinSabor.push(`${p.codigo} - ${p.descripcion_larga}`);
  }

  const descripcionCorta = valorONull(p.descripcion_corta);
  const descripcionLarga = p.descripcion_larga;

  productosResueltos.push({
    id: `PRD-${p.codigo}`,
    codigo: p.codigo,
    descripcionLarga,
    descripcionCorta: descripcionCorta ?? '',
    nombre: descripcionCorta ?? descripcionLarga,
    alias: valorONull(p.alias),
    marca: valorONull(p.marca),
    presentacion: valorONull(p.presentacion),
    unidadesPorCaja: Number(p.unidades),
    pesoKg: Number(p.peso_kg),
    saborId: sabor ? sabor.id : null,
    sabor: sabor ? sabor.nombre : '',
    estado: 'activo',
  });
}

productosResueltos.sort((a, b) => a.codigo.localeCompare(b.codigo));
const productosJson = productosResueltos;
const productoCodigosValidos = new Set(productosJson.map((p) => p.codigo));

// ---------------------------------------------------------------------------
// 6) CAUSAS DE PARADA (arbol tipo -> general -> especifica)
// ---------------------------------------------------------------------------

// Mapeo fijo tipo legado (columna `tipo`, nombre real) -> codigo/nombre de tesis.
// La tabla tipo_paradas trae ademas "Prueba" (tipo=NP), que se excluye.
const MAPA_TIPO_PARADA = new Map([
  // nombreRealEnMayus -> { codigo, nombre, codigoLegado, clasificacion }
  [
    'PARO RUTINARIOS (PP)',
    {
      codigo: 'PP-01',
      nombre: 'Paro rutinario (planificado)',
      codigoLegado: 'PP',
      clasificacion: 'programada',
    },
  ],
  [
    'PARO FALLAS (PNP)',
    {
      codigo: 'PN-02',
      nombre: 'Paro por fallas',
      codigoLegado: 'PNP',
      clasificacion: 'imprevista',
    },
  ],
  [
    'DEMORAS (PNP)',
    {
      codigo: 'PN-03',
      nombre: 'Demoras',
      codigoLegado: 'PNP',
      clasificacion: 'imprevista',
    },
  ],
  [
    'PARO IMPREVISTOS (PNP)',
    {
      codigo: 'PN-04',
      nombre: 'Paro imprevisto',
      codigoLegado: 'PNP',
      clasificacion: 'imprevista',
    },
  ],
  [
    'PARO SIN PROGRAMA',
    {
      codigo: 'PS-05',
      nombre: 'Paro sin programa',
      codigoLegado: 'PSP',
      clasificacion: 'imprevista',
    },
  ],
]);

// tipo_parada.id (postgres) -> definicion de tesis (o null si se excluye, ej. "Prueba").
const tipoParadaIdADefinicion = new Map();
for (const tp of entidades.tipo_paradas.filas) {
  const definicion = MAPA_TIPO_PARADA.get(tp.nombre.trim());
  if (definicion) {
    tipoParadaIdADefinicion.set(tp.id, { ...definicion, idLegado: Number(tp.id) });
  } else {
    reporte.descartes.push(
      `tipo_paradas id=${tp.id} nombre="${tp.nombre}": excluido del arbol de causas de parada (no esta en el mapeo de tesis)`,
    );
  }
}

// categoria_general.id -> tipo_parada.id (a traves del link)
const generalATipoParada = new Map();
for (const fila of tablasCrudas.categoria_generals_tipo_parada_lnk) {
  generalATipoParada.set(fila.categoria_general_id, fila.tipo_parada_id);
}

// Agrupar generales validos (con tipo mapeado) por codigo de tipo.
const generalesPorTipo = new Map(); // codigoTipo -> [{fila, definicionTipo}]
for (const general of entidades.categoria_generals.filas) {
  const idTipoCrudo = generalATipoParada.get(general.id);
  if (idTipoCrudo === undefined) {
    reporte.anomalias.push(
      `categoria_generals id=${general.id} nombre="${general.nombre}": sin link a tipo_paradas -> excluido`,
    );
    continue;
  }
  const tipoResuelto = entidades.tipo_paradas.resolver(idTipoCrudo);
  if (!tipoResuelto) {
    reporte.anomalias.push(
      `categoria_generals id=${general.id} nombre="${general.nombre}": el tipo_parada referenciado no existe tras deduplicar -> excluido`,
    );
    continue;
  }
  const definicionTipo = tipoParadaIdADefinicion.get(tipoResuelto.id);
  if (!definicionTipo) {
    // Tipo excluido explicitamente (ej. "Prueba"/NP).
    continue;
  }
  if (!generalesPorTipo.has(definicionTipo.codigo)) {
    generalesPorTipo.set(definicionTipo.codigo, []);
  }
  generalesPorTipo.get(definicionTipo.codigo).push({ general, definicionTipo });
}

// especifica.id -> general.id (a traves del link)
const especificaAGeneral = new Map();
for (const fila of tablasCrudas.categoria_especificas_categoria_general_lnk) {
  especificaAGeneral.set(fila.categoria_especifica_id, fila.categoria_general_id);
}

const causasParadaJson = [];
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Recorremos los tipos en el orden fijo de la tesis (PP-01, PN-02, PN-03, PN-04, PS-05).
const tiposOrdenados = [...MAPA_TIPO_PARADA.values()].sort((a, b) =>
  a.codigo.localeCompare(b.codigo),
);

for (const defTipo of tiposOrdenados) {
  // Buscamos el idLegado real (puede haber mas de un tipo_parada con el mismo nombre
  // mapeado, aunque en este dump la relacion es 1 a 1).
  const idsLegadosTipo = [...tipoParadaIdADefinicion.values()]
    .filter((def) => def.codigo === defTipo.codigo)
    .map((def) => def.idLegado);

  const idTipoNodo = `CPA-${defTipo.codigo}`;
  causasParadaJson.push({
    id: idTipoNodo,
    codigo: defTipo.codigo,
    nombre: defTipo.nombre,
    nivel: 'tipo',
    parentId: null,
    clasificacion: defTipo.clasificacion,
    afectaOee: true,
    requiereEvidencia: false,
    requiereSolicitud: false,
    tiempoEstandarMin: 0,
    lineasAplicables: [],
    estado: 'activo',
    codigoLegado: defTipo.codigoLegado,
    idLegado: idsLegadosTipo.length === 1 ? idsLegadosTipo[0] : idsLegadosTipo,
    paradasHistoricas: 0,
  });

  const generales = (generalesPorTipo.get(defTipo.codigo) ?? []).sort((a, b) =>
    comparadorEs(a.general.nombre, b.general.nombre),
  );

  // Deteccion de duplicados exactos de nombre dentro del mismo tipo.
  const nombresVistos = new Map(); // nombreNormalizado -> general.id conservado
  const generalesFiltrados = [];
  for (const item of generales) {
    const key = normalizarMayusSinTildes(item.general.nombre);
    if (nombresVistos.has(key)) {
      reporte.anomalias.push(
        `categoria_generals id=${item.general.id} nombre="${item.general.nombre}" (tipo ${defTipo.codigo}): ` +
          `duplicado exacto de otro general del mismo tipo (id=${nombresVistos.get(key)}) -> descartado`,
      );
      continue;
    }
    nombresVistos.set(key, item.general.id);
    generalesFiltrados.push(item);
  }

  const generalIdCrudoANodo = new Map(); // general.id (crudo) -> {idNodo, letra}
  const especificasPorGeneral = new Map(); // general.id (crudo) -> [especifica]

  generalesFiltrados.forEach((item, idx) => {
    const letra = LETRAS[idx] ?? `X${idx}`;
    const codigoGeneral = `${defTipo.codigo}-${letra}`;
    const idNodoGeneral = `CPA-${codigoGeneral}`;
    generalIdCrudoANodo.set(item.general.id, { idNodo: idNodoGeneral, codigoGeneral });
    causasParadaJson.push({
      id: idNodoGeneral,
      codigo: codigoGeneral,
      nombre: item.general.nombre,
      nivel: 'general',
      parentId: idTipoNodo,
      clasificacion: defTipo.clasificacion,
      afectaOee: true,
      requiereEvidencia: false,
      requiereSolicitud: false,
      tiempoEstandarMin: 0,
      lineasAplicables: [],
      estado: 'activo',
      codigoLegado: codigoLegadoOnull(item.general.codigo),
      idLegado: Number(item.general.id),
      paradasHistoricas: 0,
    });
    especificasPorGeneral.set(item.general.id, []);
  });

  // General "Otros" (si existe) para colgar especificas huerfanas de este tipo.
  const generalOtrosId = generalesFiltrados.find(
    (it) => normalizarMayusSinTildes(it.general.nombre) === 'OTROS',
  )?.general.id;

  // Reunir especificas de este tipo (via sus generales).
  for (const especifica of entidades.categoria_especificas.filas) {
    const idGeneralCrudo = especificaAGeneral.get(especifica.id);
    let generalDestino = idGeneralCrudo;

    if (idGeneralCrudo === undefined) {
      continue; // se procesa en la pasada de huerfanos globales, mas abajo.
    }
    const generalResuelto = entidades.categoria_generals.resolver(idGeneralCrudo);
    if (!generalResuelto) continue;

    // Solo procesamos aqui las especificas cuyo general pertenece a este tipo.
    if (!generalIdCrudoANodo.has(generalResuelto.id)) continue;

    especificasPorGeneral.get(generalResuelto.id).push(especifica);
  }

  // Asignar codigos correlativos por tipo: orden = letra del general, luego nombre.
  let correlativo = 1;
  for (const item of generalesFiltrados) {
    const especificas = (especificasPorGeneral.get(item.general.id) ?? []).sort(
      (a, b) => comparadorEs(a.nombre, b.nombre),
    );
    const nodoGeneral = generalIdCrudoANodo.get(item.general.id);
    for (const especifica of especificas) {
      const codigoEspecifica = `${defTipo.codigo}-${String(correlativo).padStart(2, '0')}`;
      correlativo += 1;
      const oeeReal = especifica.oee;
      causasParadaJson.push({
        id: `CPA-${codigoEspecifica}`,
        codigo: codigoEspecifica,
        nombre: especifica.nombre,
        nivel: 'especifica',
        parentId: nodoGeneral.idNodo,
        clasificacion: defTipo.clasificacion,
        afectaOee: oeeReal === null ? true : oeeReal === 't',
        requiereEvidencia: false,
        requiereSolicitud: false,
        tiempoEstandarMin: 0, // columna tiempo_estandar_min no existe en este dump (PRE-TIEMPOS-ESTANDAR)
        lineasAplicables: [],
        estado: 'activo',
        codigoLegado: codigoLegadoOnull(especifica.codigo),
        idLegado: Number(especifica.id),
        paradasHistoricas: 0,
      });
    }
  }

  // Especificas huerfanas (link roto) que pertenecerian a este tipo: no aplica en
  // este dump (se verifico 0 huerfanas), pero se deja la logica por si el dump cambia.
}

// Verificacion global de especificas huerfanas (sin general en absoluto).
for (const especifica of entidades.categoria_especificas.filas) {
  if (!especificaAGeneral.has(especifica.id)) {
    reporte.anomalias.push(
      `categoria_especificas id=${especifica.id} nombre="${especifica.nombre}": SIN LINK a categoria_general (link roto) -> no se incluyo en causas-parada.json`,
    );
  }
}

// ---------------------------------------------------------------------------
// 7) CAUSAS DE MERMA (arbol tipo -> clasificacion -> causa)
// ---------------------------------------------------------------------------

const MAPA_TIPO_MERMA = new Map([
  ['MERMA DEL PROCESO', { codigo: 'MP-01', nombre: 'Merma del proceso' }],
  ['MERMA DESVIO DEL PROCESO', { codigo: 'MP-02', nombre: 'Merma por desvío del proceso' }],
  ['MERMA FALLAS OPERATIVAS', { codigo: 'MP-03', nombre: 'Merma por fallas operativas' }],
  [
    'MERMA FALLAS MANTENIMIENTO',
    { codigo: 'MP-04', nombre: 'Merma por fallas de mantenimiento' },
  ],
  ['MERMA FALLAS EXTERNAS', { codigo: 'MP-05', nombre: 'Merma por fallas externas' }],
]);

const tipoMermaIdADefinicion = new Map();
for (const tm of entidades.merma_tipo_produccions.filas) {
  const def = MAPA_TIPO_MERMA.get(tm.nombre.trim());
  if (!def) {
    reporte.anomalias.push(
      `merma_tipo_produccions id=${tm.id} nombre="${tm.nombre}": no esta en el mapeo de tesis -> excluido`,
    );
    continue;
  }
  tipoMermaIdADefinicion.set(tm.id, { ...def, idLegado: Number(tm.id) });
}

const causaAMermaTipo = new Map();
for (const fila of tablasCrudas.merma_causas_merma_tipo_produccion_lnk) {
  causaAMermaTipo.set(fila.merma_causa_id, fila.merma_tipo_produccion_id);
}
const causaAMermaClasificacion = new Map();
for (const fila of tablasCrudas.merma_causas_merma_clasificacion_lnk) {
  causaAMermaClasificacion.set(fila.merma_causa_id, fila.merma_clasificacion_id);
}
// causa -> [linea.id crudo, ...]
const causaALineas = new Map();
for (const fila of tablasCrudas.merma_causas_lineas_lnk) {
  if (!causaALineas.has(fila.merma_causa_id)) causaALineas.set(fila.merma_causa_id, []);
  causaALineas.get(fila.merma_causa_id).push(fila.linea_id);
}

function lineasAplicablesDesdeCausa(idCausaCrudo) {
  const idsLineaCrudos = causaALineas.get(idCausaCrudo) ?? [];
  const resultado = [];
  for (const idCrudo of idsLineaCrudos) {
    const linea = entidades.lineas.resolver(idCrudo);
    if (!linea) {
      reporte.anomalias.push(
        `merma_causas_lineas_lnk: causa cruda id=${idCausaCrudo} referencia una linea (id crudo ${idCrudo}) que no existe tras deduplicar`,
      );
      continue;
    }
    const lineaJson = lineaLegadoAJson.get(linea.id);
    if (lineaJson) resultado.push(lineaJson.id);
  }
  return [...new Set(resultado)].sort();
}

// Para cada causa real: {tipo, clasificacion, fila}
const causasConContexto = [];
for (const causa of entidades.merma_causas.filas) {
  const idTipoCrudo = causaAMermaTipo.get(causa.id);
  const idClasCrudo = causaAMermaClasificacion.get(causa.id);
  if (idTipoCrudo === undefined) {
    reporte.anomalias.push(
      `merma_causas id=${causa.id} nombre="${causa.nombre}": sin link a merma_tipo_produccion -> excluida`,
    );
    continue;
  }
  if (idClasCrudo === undefined) {
    reporte.anomalias.push(
      `merma_causas id=${causa.id} nombre="${causa.nombre}": sin link a merma_clasificacion -> excluida`,
    );
    continue;
  }
  const tipoResuelto = entidades.merma_tipo_produccions.resolver(idTipoCrudo);
  const clasResuelta = entidades.merma_clasificacions.resolver(idClasCrudo);
  if (!tipoResuelto || !clasResuelta) {
    reporte.anomalias.push(
      `merma_causas id=${causa.id} nombre="${causa.nombre}": tipo o clasificacion no resuelven tras deduplicar -> excluida`,
    );
    continue;
  }
  const defTipo = tipoMermaIdADefinicion.get(tipoResuelto.id);
  if (!defTipo) continue; // tipo fuera del mapeo de tesis

  causasConContexto.push({
    causa,
    defTipo,
    clasificacionNombre: clasResuelta.nombre,
  });
}

const causasMermaJson = [];
const tiposMermaOrdenados = [...MAPA_TIPO_MERMA.values()].sort((a, b) =>
  a.codigo.localeCompare(b.codigo),
);

for (const defTipo of tiposMermaOrdenados) {
  const idLegadoTipo = [...tipoMermaIdADefinicion.entries()].find(
    ([, def]) => def.codigo === defTipo.codigo,
  )?.[0];

  const idNodoTipo = `CME-${defTipo.codigo}`;
  causasMermaJson.push({
    id: idNodoTipo,
    codigo: defTipo.codigo,
    nombre: defTipo.nombre,
    nivel: 'tipo',
    parentId: null,
    aplicaA: ['MP', 'EP', 'PT'],
    lineasAplicables: [],
    requiereEvidencia: false,
    requiereComentario: false,
    requiereSolicitud: false,
    estado: 'activo',
    mermasHistoricas: 0,
    idLegado: idLegadoTipo !== undefined ? Number(idLegadoTipo) : null,
  });

  const causasDeTipo = causasConContexto.filter((c) => c.defTipo.codigo === defTipo.codigo);

  // Clasificaciones unicas presentes para este tipo, orden alfabetico.
  const nombresClasificacion = [
    ...new Set(causasDeTipo.map((c) => c.clasificacionNombre)),
  ].sort(comparadorEs);

  const clasificacionANodo = new Map(); // nombreClasificacion -> {idNodo, letra}
  nombresClasificacion.forEach((nombreClas, idx) => {
    const letra = LETRAS[idx] ?? `X${idx}`;
    const codigoClas = `${defTipo.codigo}-${letra}`;
    const idNodoClas = `CME-${codigoClas}`;
    clasificacionANodo.set(nombreClas, { idNodo: idNodoClas, codigoClas });
    causasMermaJson.push({
      id: idNodoClas,
      codigo: codigoClas,
      nombre: nombreClas,
      nivel: 'clasificacion',
      parentId: idNodoTipo,
      aplicaA: ['MP', 'EP', 'PT'],
      lineasAplicables: [],
      requiereEvidencia: false,
      requiereComentario: false,
      requiereSolicitud: false,
      estado: 'activo',
      mermasHistoricas: 0,
      idLegado: null,
    });
  });

  // Ordenar causas por (clasificacion, nombre normalizado) para deduplicar y asignar codigos.
  const causasOrdenadas = [...causasDeTipo].sort(
    (a, b) =>
      comparadorEs(a.clasificacionNombre, b.clasificacionNombre) ||
      comparadorEs(limpiarEspacios(a.causa.nombre), limpiarEspacios(b.causa.nombre)),
  );

  const vistosPorClasificacion = new Map(); // "clasificacion|nombreNormalizado" -> causa.id conservada
  let correlativo = 1;
  for (const item of causasOrdenadas) {
    const nombreNormalizado = normalizarMayusSinTildes(limpiarEspacios(item.causa.nombre))
      .replace(/^OTROS$/, 'OTRO'); // "Otros"/"Otro" se tratan como el mismo nombre
    const clave = `${item.clasificacionNombre}|${nombreNormalizado}`;

    if (vistosPorClasificacion.has(clave)) {
      reporte.anomalias.push(
        `merma_causas id=${item.causa.id} nombre="${item.causa.nombre}" (tipo ${defTipo.codigo}, clasificacion "${item.clasificacionNombre}"): ` +
          `duplicado por nombre normalizado de la causa id=${vistosPorClasificacion.get(clave)} -> descartada`,
      );
      continue;
    }
    vistosPorClasificacion.set(clave, item.causa.id);

    const nodoClasificacion = clasificacionANodo.get(item.clasificacionNombre);
    const codigoCausa = `${defTipo.codigo}-${String(correlativo).padStart(2, '0')}`;
    correlativo += 1;

    causasMermaJson.push({
      id: `CME-${codigoCausa}`,
      codigo: codigoCausa,
      nombre: oracionDesde(item.causa.nombre),
      nivel: 'causa',
      parentId: nodoClasificacion.idNodo,
      aplicaA: ['MP', 'EP', 'PT'],
      lineasAplicables: lineasAplicablesDesdeCausa(item.causa.id),
      requiereEvidencia: false,
      requiereComentario: item.causa.comentario === 't',
      requiereSolicitud: item.causa.numero_solicitud === 't',
      estado: 'activo',
      mermasHistoricas: 0,
      idLegado: Number(item.causa.id),
    });
  }
}

// ---------------------------------------------------------------------------
// Validacion de integridad referencial (falla el script si algo no resuelve)
// ---------------------------------------------------------------------------

const erroresValidacion = [];

// causas-parada: todo parentId debe existir como id de otro nodo.
{
  const idsValidos = new Set(causasParadaJson.map((n) => n.id));
  for (const nodo of causasParadaJson) {
    if (nodo.parentId !== null && !idsValidos.has(nodo.parentId)) {
      erroresValidacion.push(
        `causas-parada.json: nodo ${nodo.id} tiene parentId="${nodo.parentId}" que no existe`,
      );
    }
  }
}

// causas-merma: idem.
{
  const idsValidos = new Set(causasMermaJson.map((n) => n.id));
  for (const nodo of causasMermaJson) {
    if (nodo.parentId !== null && !idsValidos.has(nodo.parentId)) {
      erroresValidacion.push(
        `causas-merma.json: nodo ${nodo.id} tiene parentId="${nodo.parentId}" que no existe`,
      );
    }
    for (const lineaId of nodo.lineasAplicables) {
      if (!lineaIdsValidos.has(lineaId)) {
        erroresValidacion.push(
          `causas-merma.json: nodo ${nodo.id} referencia lineaId="${lineaId}" que no existe en lineas.json`,
        );
      }
    }
  }
}

// velocidades-estandar: lineaId debe existir en lineas.json; productoCodigo debe
// existir entre TODOS los productos del dump (no solo los que quedan en
// productos.json, dado que productos.json filtra por estado/velocidad activa).
{
  const todosLosCodigosDeProducto = new Set(
    entidades.productos.filas.map((p) => p.codigo),
  );
  for (const v of velocidadesEstandarJson) {
    if (!lineaIdsValidos.has(v.lineaId)) {
      erroresValidacion.push(
        `velocidades-estandar.json: ${v.id} referencia lineaId="${v.lineaId}" que no existe en lineas.json`,
      );
    }
    if (!todosLosCodigosDeProducto.has(v.productoCodigo)) {
      erroresValidacion.push(
        `velocidades-estandar.json: ${v.id} referencia productoCodigo="${v.productoCodigo}" que no existe en ningun producto del dump`,
      );
    }
  }
}

// productos: saborId debe existir en sabores.json (si no es null).
for (const p of productosJson) {
  if (p.saborId !== null && !saboresIdsValidos.has(p.saborId)) {
    erroresValidacion.push(
      `productos.json: ${p.codigo} referencia saborId="${p.saborId}" que no existe en sabores.json`,
    );
  }
}

if (erroresValidacion.length > 0) {
  console.error('\nFALLARON VALIDACIONES DE INTEGRIDAD REFERENCIAL:');
  for (const e of erroresValidacion) console.error(`  - ${e}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Escritura de los JSON
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

function escribirJson(nombreArchivo, datos) {
  const ruta = join(OUT_DIR, nombreArchivo);
  writeFileSync(ruta, JSON.stringify(datos, null, 2) + '\n', 'utf8');
  console.log(`  - ${nombreArchivo}: ${datos.length} registros`);
}

console.log('\nEscribiendo JSON en', OUT_DIR);
escribirJson('lineas.json', lineasJson);
escribirJson('sabores.json', saboresJsonLimpio);
escribirJson('velocidades-estandar.json', velocidadesEstandarJson);
escribirJson('productos.json', productosJson);
escribirJson('causas-parada.json', causasParadaJson);
escribirJson('causas-merma.json', causasMermaJson);

// ---------------------------------------------------------------------------
// Informe final
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(80));
console.log('INFORME DE EXTRACCION');
console.log('='.repeat(80));

console.log(`\nlineas.json: ${lineasJson.length} lineas`);
console.log(`sabores.json: ${saboresJsonLimpio.length} sabores`);
console.log(`velocidades-estandar.json: ${velocidadesEstandarJson.length} pares producto x linea`);
console.log(`productos.json: ${productosJson.length} productos`);

const conSabor = productosJson.filter((p) => p.saborId !== null).length;
const pct = ((conSabor / productosJson.length) * 100).toFixed(1);
console.log(
  `  -> ${conSabor}/${productosJson.length} productos con sabor resuelto (${pct}%)`,
);
if (productosSinSabor.length > 0) {
  console.log(`  -> productos SIN sabor resuelto (${productosSinSabor.length}):`);
  for (const p of productosSinSabor) console.log(`       - ${p}`);
}

const tiposParada = causasParadaJson.filter((n) => n.nivel === 'tipo');
const generalesParada = causasParadaJson.filter((n) => n.nivel === 'general');
const especificasParada = causasParadaJson.filter((n) => n.nivel === 'especifica');
console.log(
  `\ncausas-parada.json: ${tiposParada.length} tipos, ${generalesParada.length} generales, ${especificasParada.length} especificas`,
);
console.log('  Tipos y sus generales:');
for (const t of tiposParada) {
  console.log(`    ${t.codigo} "${t.nombre}" (codigoLegado=${t.codigoLegado})`);
  for (const g of generalesParada.filter((g) => g.parentId === t.id)) {
    const nEsp = especificasParada.filter((e) => e.parentId === g.id).length;
    console.log(`      ${g.codigo} "${g.nombre}" (${nEsp} especificas)`);
  }
}

const tiposMerma = causasMermaJson.filter((n) => n.nivel === 'tipo');
const clasificacionesMerma = causasMermaJson.filter((n) => n.nivel === 'clasificacion');
const causasHojaMerma = causasMermaJson.filter((n) => n.nivel === 'causa');
console.log(
  `\ncausas-merma.json: ${tiposMerma.length} tipos, ${clasificacionesMerma.length} clasificaciones, ${causasHojaMerma.length} causas hoja`,
);
console.log('  Tipos y sus clasificaciones:');
for (const t of tiposMerma) {
  console.log(`    ${t.codigo} "${t.nombre}"`);
  for (const c of clasificacionesMerma.filter((c) => c.parentId === t.id)) {
    const nCausas = causasHojaMerma.filter((h) => h.parentId === c.id).length;
    console.log(`      ${c.codigo} "${c.nombre}" (${nCausas} causas)`);
  }
}

if (reporte.descartes.length > 0) {
  console.log(`\nFilas descartadas (${reporte.descartes.length}):`);
  for (const d of reporte.descartes) console.log(`  - ${d}`);
} else {
  console.log('\nFilas descartadas: ninguna.');
}

if (reporte.anomalias.length > 0) {
  console.log(`\nAnomalias detectadas (${reporte.anomalias.length}):`);
  for (const a of reporte.anomalias) console.log(`  - ${a}`);
} else {
  console.log('\nAnomalias detectadas: ninguna.');
}

console.log('\nValidacion de integridad referencial: OK (todos los parentId/productoCodigo/lineaId/saborId resuelven).');
console.log('\nListo.');
