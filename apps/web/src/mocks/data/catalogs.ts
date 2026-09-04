import type {
  CausaMerma,
  CausaParada,
  EstadoCatalogo,
  Linea,
  NivelCausa,
  NivelCausaMerma,
  Producto,
  Sabor,
  TipoMermaCodigo,
  TipoProcesoLinea,
  TurnoDef,
  VelocidadEstandar,
} from '@mes/types';
import causasMermaJson from './real/causas-merma.json';
import causasParadaJson from './real/causas-parada.json';
import lineasJson from './real/lineas.json';
import productosJson from './real/productos.json';
import saboresJson from './real/sabores.json';
import velocidadesJson from './real/velocidades-estandar.json';

/**
 * Catálogos maestros **reales** de Yamboly, extraídos del dump del sistema
 * original a `./real/*.json` (ver `docs/` y el commit de extracción). Este
 * módulo solo los tipa y deriva los índices: nunca inventa registros.
 *
 * Volúmenes: 9 líneas · 41 sabores · 201 productos ·
 * 333 pares producto × línea · 83 causas de parada ·
 * 56 causas de merma · 2 turnos.
 *
 * Los campos `idLegado` del dump no se persisten: solo sirvieron para el
 * cruce durante la extracción.
 */

/** Nº de líneas reales; `lineasAplicables` con las 9 equivale a «todas» (`[]`). */
const TOTAL_LINEAS = lineasJson.length;

function normalizarLineas(ids: string[]): string[] {
  return ids.length === TOTAL_LINEAS ? [] : [...ids];
}

function unDecimal(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Sabores                                                             */
/* ------------------------------------------------------------------ */

export const sabores: Sabor[] = saboresJson.map((s) => ({
  id: s.id,
  codigo: s.codigo,
  nombre: s.nombre,
  estado: s.estado as EstadoCatalogo,
}));

/** Nombres de sabor del maestro real (41), usados como texto en mermas. */
export const SABORES: string[] = sabores.map((s) => s.nombre);

/* ------------------------------------------------------------------ */
/* Productos                                                           */
/* ------------------------------------------------------------------ */

export const productos: Producto[] = productosJson.map((p) => ({
  id: p.id,
  codigo: p.codigo,
  descripcionLarga: p.descripcionLarga,
  descripcionCorta: p.descripcionCorta,
  nombre: p.nombre,
  alias: p.alias,
  marca: p.marca,
  presentacion: p.presentacion,
  unidadesPorCaja: p.unidadesPorCaja,
  pesoKg: p.pesoKg,
  saborId: p.saborId,
  sabor: p.sabor,
  estado: p.estado as EstadoCatalogo,
}));

const codigosProducto = new Set(productos.map((p) => p.codigo));

/* ------------------------------------------------------------------ */
/* Velocidad estándar (par producto × línea, tabla `producto_linea`)    */
/* ------------------------------------------------------------------ */

/**
 * 333 pares activos. Del dump (340) se descartan:
 * - los **6** cuyo producto ya no está en el maestro vigente (productos dados
 *   de baja que conservaban su velocidad);
 * - **1 duplicado** `1120116 × LIN-MOLD-A2` (`VE-0130`, 11 160 u/h) que rompe la
 *   unicidad `(productoId, lineaId)` de `producto_linea`; se conserva `VE-0129`
 *   (15 120 u/h), el primero del maestro.
 */
const paresVistos = new Set<string>();

export const velocidadesEstandar: VelocidadEstandar[] = velocidadesJson
  .filter((v) => {
    if (!codigosProducto.has(v.productoCodigo)) return false;
    const clave = `${v.productoCodigo}|${v.lineaId}`;
    if (paresVistos.has(clave)) return false;
    paresVistos.add(clave);
    return true;
  })
  .map((v) => ({
    id: v.id,
    productoId: `PRD-${v.productoCodigo}`,
    lineaId: v.lineaId,
    velocidadUnidHora: v.velocidadUnidHora,
    velocidadUnidMin: v.velocidadUnidMin,
    mermaEstandarPct: v.mermaEstandarPct,
    cipMin: v.cipMin as number | null,
    arranqueMin: v.arranqueMin as number | null,
    estado: v.estado as EstadoCatalogo,
  }));

/* ------------------------------------------------------------------ */
/* Líneas (9 máquinas físicas reales)                                  */
/* ------------------------------------------------------------------ */

function capacidadDeLinea(lineaId: string): number {
  const pares = velocidadesEstandar.filter((v) => v.lineaId === lineaId && v.estado === 'activo');
  if (pares.length === 0) return 0;
  return unDecimal(Math.max(...pares.map((v) => v.velocidadUnidMin)));
}

export const lineas: Linea[] = lineasJson.map((l) => ({
  id: l.id,
  codigo: l.codigo,
  nombre: l.nombre,
  nombreCorto: l.nombreCorto,
  tipoProceso: l.tipoProceso as TipoProcesoLinea,
  estado: l.estado as EstadoCatalogo,
  capacidadUnidadesMin: capacidadDeLinea(l.id),
}));

/* ------------------------------------------------------------------ */
/* Causas de parada (árbol Tipo → General → Específica, 5/26/52)       */
/* ------------------------------------------------------------------ */

export const causasParada: CausaParada[] = causasParadaJson.map((c) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  nivel: c.nivel as NivelCausa,
  parentId: c.parentId,
  clasificacion: c.clasificacion as 'programada' | 'imprevista',
  afectaOee: c.afectaOee,
  requiereEvidencia: c.requiereEvidencia,
  requiereSolicitud: c.requiereSolicitud,
  tiempoEstandarMin: c.tiempoEstandarMin,
  lineasAplicables: normalizarLineas(c.lineasAplicables),
  estado: c.estado as EstadoCatalogo,
  paradasHistoricas: c.paradasHistoricas,
  codigoLegado: c.codigoLegado,
}));

/* ------------------------------------------------------------------ */
/* Causas de merma (árbol Tipo → Clasificación → Causa, 5/11/40)       */
/* ------------------------------------------------------------------ */

export const causasMerma: CausaMerma[] = causasMermaJson.map((c) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  nivel: c.nivel as NivelCausaMerma,
  parentId: c.parentId,
  aplicaA: c.aplicaA as TipoMermaCodigo[],
  lineasAplicables: normalizarLineas(c.lineasAplicables),
  requiereEvidencia: c.requiereEvidencia,
  requiereComentario: c.requiereComentario,
  requiereSolicitud: c.requiereSolicitud,
  estado: c.estado as EstadoCatalogo,
  mermasHistoricas: c.mermasHistoricas,
}));

/* ------------------------------------------------------------------ */
/* Turnos reales: D 06:00–18:00 · N 18:00–06:00                        */
/* ------------------------------------------------------------------ */

export const turnos: TurnoDef[] = [
  { id: 'TUR-D', codigo: 'D', label: 'Día', inicio: '06:00', fin: '18:00', activo: true },
  { id: 'TUR-N', codigo: 'N', label: 'Noche', inicio: '18:00', fin: '06:00', activo: true },
];

/* ------------------------------------------------------------------ */
/* Índices de acceso rápido usados por handlers y generadores          */
/* ------------------------------------------------------------------ */

export const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
export const saborPorId = new Map(sabores.map((s) => [s.id, s]));
export const productoPorId = new Map(productos.map((p) => [p.id, p]));
export const causaParadaPorId = new Map(causasParada.map((c) => [c.id, c]));
export const causaMermaPorId = new Map(causasMerma.map((c) => [c.id, c]));
export const velocidadEstandarPorId = new Map(velocidadesEstandar.map((v) => [v.id, v]));

/** Pares producto × línea agrupados por línea, en el orden del maestro. */
export const velocidadesPorLinea = new Map<string, VelocidadEstandar[]>(
  lineas.map((l) => [l.id, velocidadesEstandar.filter((v) => v.lineaId === l.id)]),
);

/** Par activo de un producto en una línea; `undefined` si la línea no lo corre. */
export function parProductoLinea(
  productoId: string,
  lineaId: string,
): VelocidadEstandar | undefined {
  return velocidadesEstandar.find(
    (v) => v.productoId === productoId && v.lineaId === lineaId && v.estado === 'activo',
  );
}

export const causasEspecificas = causasParada.filter((c) => c.nivel === 'especifica');
export const tiposCausa = causasParada.filter((c) => c.nivel === 'tipo');

/** Devuelve el tipo (raíz) al que pertenece una causa de parada de cualquier nivel. */
export function tipoDeCausa(causaId: string): CausaParada | undefined {
  let actual = causaParadaPorId.get(causaId);
  while (actual && actual.parentId) actual = causaParadaPorId.get(actual.parentId);
  return actual;
}

/** Hojas del árbol de merma (`nivel: 'causa'`) — las únicas seleccionables. */
export const causasMermaHoja = causasMerma.filter((c) => c.nivel === 'causa');
export const tiposCausaMerma = causasMerma.filter((c) => c.nivel === 'tipo');

/** Clasificación (nivel intermedio) de una hoja de merma. */
export function clasificacionDeMerma(causaId: string): CausaMerma | undefined {
  const hoja = causaMermaPorId.get(causaId);
  return hoja?.parentId ? causaMermaPorId.get(hoja.parentId) : undefined;
}

/** Tipo (raíz) de una causa de merma de cualquier nivel. */
export function tipoDeMerma(causaId: string): CausaMerma | undefined {
  let actual = causaMermaPorId.get(causaId);
  while (actual && actual.parentId) actual = causaMermaPorId.get(actual.parentId);
  return actual;
}
