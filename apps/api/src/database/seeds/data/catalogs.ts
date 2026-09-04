import type {
  CausaMerma,
  CausaParada,
  EstadoCatalogo,
  Linea,
  Maquina,
  NivelCausa,
  NivelCausaMerma,
  Producto,
  Sabor,
  Sede,
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
import sedesJson from './real/sedes.json';
import velocidadesJson from './real/velocidades-estandar.json';

/**
 * Catálogos maestros **reales** de Yamboly, extraídos del dump del sistema
 * original a `./real/*.json` (ver `docs/` y el commit de extracción). Este
 * módulo solo los tipa y deriva los índices: nunca inventa registros.
 *
 * Volúmenes: 9 sedes · 9 líneas · 41 sabores · 201 productos ·
 * 334 pares producto × línea · 33 máquinas · 83 causas de parada ·
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
/* Sedes                                                               */
/* ------------------------------------------------------------------ */

export const sedes: Sede[] = sedesJson.map((s) => ({
  id: s.id,
  codigo: s.codigo,
  nombre: s.nombre,
  ciudad: s.ciudad,
  activa: s.activa,
}));

/** Sede de planta: todas las líneas y los usuarios del seed cuelgan de aquí. */
export const SEDE_PRINCIPAL = 'SED-LIMA';

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
  sedeId: l.sedeId,
  estado: l.estado as EstadoCatalogo,
  capacidadUnidadesMin: capacidadDeLinea(l.id),
}));

/* ------------------------------------------------------------------ */
/* Máquinas = equipos de cada línea (2–4 por línea)                    */
/* ------------------------------------------------------------------ */

/**
 * Equipos físicos que componen cada línea. La familia de proceso define la
 * dotación: llenadoras (dosificadora/llenadora, codificadora, tapadora o
 * selladora, faja), extrusoras (extrusora, envolvedora, codificadora, túnel de
 * frío) y moldeadoras (moldeadora, descargador o pinzas, envolvedora, túnel).
 */
export const maquinas: Maquina[] = [
  /* Extrusora 2 */
  { id: 'MAQ-01', codigo: 'MQ-EXTR2-01', nombre: 'Extrusora EXTR 2', tipo: 'Extrusora', lineaId: 'LIN-EXTR-2', estado: 'operativa', paradas30d: 12 },
  { id: 'MAQ-02', codigo: 'MQ-EXTR2-02', nombre: 'Envolvedora EXTR 2', tipo: 'Envolvedora', lineaId: 'LIN-EXTR-2', estado: 'operativa', paradas30d: 9 },
  { id: 'MAQ-03', codigo: 'MQ-EXTR2-03', nombre: 'Codificadora EXTR 2', tipo: 'Codificadora', lineaId: 'LIN-EXTR-2', estado: 'operativa', paradas30d: 5 },
  { id: 'MAQ-04', codigo: 'MQ-EXTR2-04', nombre: 'Túnel de frío EXTR 2', tipo: 'Túnel de frío', lineaId: 'LIN-EXTR-2', estado: 'operativa', paradas30d: 3 },
  /* Extrusora 3 */
  { id: 'MAQ-05', codigo: 'MQ-EXTR3-01', nombre: 'Extrusora EXTR 3', tipo: 'Extrusora', lineaId: 'LIN-EXTR-3', estado: 'operativa', paradas30d: 10 },
  { id: 'MAQ-06', codigo: 'MQ-EXTR3-02', nombre: 'Envolvedora EXTR 3', tipo: 'Envolvedora', lineaId: 'LIN-EXTR-3', estado: 'operativa', paradas30d: 7 },
  { id: 'MAQ-07', codigo: 'MQ-EXTR3-03', nombre: 'Túnel de frío EXTR 3', tipo: 'Túnel de frío', lineaId: 'LIN-EXTR-3', estado: 'mantenimiento', paradas30d: 6 },
  /* Llenadora A1 */
  { id: 'MAQ-08', codigo: 'MQ-LLENA1-01', nombre: 'Llenadora LLEN A1', tipo: 'Llenadora', lineaId: 'LIN-LLEN-A1', estado: 'operativa', paradas30d: 8 },
  { id: 'MAQ-09', codigo: 'MQ-LLENA1-02', nombre: 'Codificadora LLEN A1', tipo: 'Codificadora', lineaId: 'LIN-LLEN-A1', estado: 'operativa', paradas30d: 4 },
  { id: 'MAQ-10', codigo: 'MQ-LLENA1-03', nombre: 'Tapadora LLEN A1', tipo: 'Tapadora', lineaId: 'LIN-LLEN-A1', estado: 'operativa', paradas30d: 6 },
  { id: 'MAQ-11', codigo: 'MQ-LLENA1-04', nombre: 'Faja transportadora LLEN A1', tipo: 'Faja transportadora', lineaId: 'LIN-LLEN-A1', estado: 'operativa', paradas30d: 3 },
  /* Llenadora A2 */
  { id: 'MAQ-12', codigo: 'MQ-LLENA2-01', nombre: 'Llenadora LLEN A2', tipo: 'Llenadora', lineaId: 'LIN-LLEN-A2', estado: 'operativa', paradas30d: 7 },
  { id: 'MAQ-13', codigo: 'MQ-LLENA2-02', nombre: 'Codificadora LLEN A2', tipo: 'Codificadora', lineaId: 'LIN-LLEN-A2', estado: 'operativa', paradas30d: 3 },
  { id: 'MAQ-14', codigo: 'MQ-LLENA2-03', nombre: 'Selladora LLEN A2', tipo: 'Selladora', lineaId: 'LIN-LLEN-A2', estado: 'operativa', paradas30d: 5 },
  /* Llenadora M1 */
  { id: 'MAQ-15', codigo: 'MQ-LLENM1-01', nombre: 'Dosificadora LLEN M1', tipo: 'Dosificadora', lineaId: 'LIN-LLEN-M1', estado: 'operativa', paradas30d: 9 },
  { id: 'MAQ-16', codigo: 'MQ-LLENM1-02', nombre: 'Codificadora LLEN M1', tipo: 'Codificadora', lineaId: 'LIN-LLEN-M1', estado: 'operativa', paradas30d: 4 },
  { id: 'MAQ-17', codigo: 'MQ-LLENM1-03', nombre: 'Tapadora LLEN M1', tipo: 'Tapadora', lineaId: 'LIN-LLEN-M1', estado: 'operativa', paradas30d: 6 },
  { id: 'MAQ-18', codigo: 'MQ-LLENM1-04', nombre: 'Faja transportadora LLEN M1', tipo: 'Faja transportadora', lineaId: 'LIN-LLEN-M1', estado: 'operativa', paradas30d: 2 },
  /* Llenadora M2 */
  { id: 'MAQ-19', codigo: 'MQ-LLENM2-01', nombre: 'Dosificadora LLEN M2', tipo: 'Dosificadora', lineaId: 'LIN-LLEN-M2', estado: 'operativa', paradas30d: 11 },
  { id: 'MAQ-20', codigo: 'MQ-LLENM2-02', nombre: 'Codificadora LLEN M2', tipo: 'Codificadora', lineaId: 'LIN-LLEN-M2', estado: 'operativa', paradas30d: 5 },
  { id: 'MAQ-21', codigo: 'MQ-LLENM2-03', nombre: 'Selladora LLEN M2', tipo: 'Selladora', lineaId: 'LIN-LLEN-M2', estado: 'operativa', paradas30d: 7 },
  { id: 'MAQ-22', codigo: 'MQ-LLENM2-04', nombre: 'Faja transportadora LLEN M2', tipo: 'Faja transportadora', lineaId: 'LIN-LLEN-M2', estado: 'operativa', paradas30d: 3 },
  /* Moldeadora A2 */
  { id: 'MAQ-23', codigo: 'MQ-MOLDA2-01', nombre: 'Moldeadora MOLD A2', tipo: 'Moldeadora', lineaId: 'LIN-MOLD-A2', estado: 'operativa', paradas30d: 10 },
  { id: 'MAQ-24', codigo: 'MQ-MOLDA2-02', nombre: 'Descargador MOLD A2', tipo: 'Descargador', lineaId: 'LIN-MOLD-A2', estado: 'operativa', paradas30d: 6 },
  { id: 'MAQ-25', codigo: 'MQ-MOLDA2-03', nombre: 'Envolvedora MOLD A2', tipo: 'Envolvedora', lineaId: 'LIN-MOLD-A2', estado: 'operativa', paradas30d: 8 },
  { id: 'MAQ-26', codigo: 'MQ-MOLDA2-04', nombre: 'Túnel de frío MOLD A2', tipo: 'Túnel de frío', lineaId: 'LIN-MOLD-A2', estado: 'operativa', paradas30d: 3 },
  /* Moldeadora A3 */
  { id: 'MAQ-27', codigo: 'MQ-MOLDA3-01', nombre: 'Moldeadora MOLD A3', tipo: 'Moldeadora', lineaId: 'LIN-MOLD-A3', estado: 'operativa', paradas30d: 12 },
  { id: 'MAQ-28', codigo: 'MQ-MOLDA3-02', nombre: 'Pinzas extractoras MOLD A3', tipo: 'Pinzas', lineaId: 'LIN-MOLD-A3', estado: 'mantenimiento', paradas30d: 9 },
  { id: 'MAQ-29', codigo: 'MQ-MOLDA3-03', nombre: 'Envolvedora MOLD A3', tipo: 'Envolvedora', lineaId: 'LIN-MOLD-A3', estado: 'operativa', paradas30d: 7 },
  /* Moldeadora A4 */
  { id: 'MAQ-30', codigo: 'MQ-MOLDA4-01', nombre: 'Moldeadora MOLD A4', tipo: 'Moldeadora', lineaId: 'LIN-MOLD-A4', estado: 'operativa', paradas30d: 9 },
  { id: 'MAQ-31', codigo: 'MQ-MOLDA4-02', nombre: 'Descargador de pinzas MOLD A4', tipo: 'Descargador', lineaId: 'LIN-MOLD-A4', estado: 'operativa', paradas30d: 5 },
  { id: 'MAQ-32', codigo: 'MQ-MOLDA4-03', nombre: 'Envolvedora MOLD A4', tipo: 'Envolvedora', lineaId: 'LIN-MOLD-A4', estado: 'operativa', paradas30d: 6 },
  { id: 'MAQ-33', codigo: 'MQ-MOLDA4-04', nombre: 'Túnel de frío MOLD A4', tipo: 'Túnel de frío', lineaId: 'LIN-MOLD-A4', estado: 'operativa', paradas30d: 4 },
];

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

export const sedePorId = new Map(sedes.map((s) => [s.id, s]));
export const lineaPorId = new Map(lineas.map((l) => [l.id, l]));
export const saborPorId = new Map(sabores.map((s) => [s.id, s]));
export const productoPorId = new Map(productos.map((p) => [p.id, p]));
export const maquinaPorId = new Map(maquinas.map((m) => [m.id, m]));
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
