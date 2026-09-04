import * as XLSX from 'xlsx';
import {
  COLUMNAS_FUENTE,
  COLUMNAS_OPCIONALES_FUENTE,
  ESTADOS_LECTURA_SENSOR,
  TIPOS_FUENTE_EXTERNA,
  TIPO_FUENTE_EXTERNA_LABEL,
} from '@mes/types';
import type {
  EstadoLecturaSensor,
  FuenteExternaResumen,
  ImportacionResultado,
  ImportacionResumen,
  RechazoFila,
  TipoFuenteExterna,
  TipoMermaCodigo,
} from '@mes/types';
import type {
  ImportacionFuenteMock,
  LecturaSensorMock,
  SolicitudExternaMock,
  TransferenciaSapMock,
} from './store';
import { getStore } from './store';
import { ahoraIso, hoyIso } from './handlers/_utils';
import {
  aFecha,
  aNumero,
  aTexto,
  isoLocal,
  leerTabla,
  normalizarCabecera,
  type FilaTabla,
  type ValorCelda,
} from './evidencia-tabla';

/**
 * Importación de las 3 fuentes externas contra las que se valida el TCI —
 * espejo literal de `EvidenceImportService` de la API. La plantilla se genera
 * aquí con SheetJS (en la API, con exceljs) y el parseo, los motivos de rechazo
 * y la deduplicación son los mismos.
 */

/** Prefijo del id de importación por tipo de fuente. */
const PREFIJO: Record<TipoFuenteExterna, string> = {
  sensores: 'IMP-SEN',
  solicitudes: 'IMP-SOL',
  sap_mermas: 'IMP-SAP',
};

/** Nombre de la hoja de datos de cada plantilla. */
const HOJA: Record<TipoFuenteExterna, string> = {
  sensores: 'Sensores',
  solicitudes: 'Solicitudes',
  sap_mermas: 'Transferencias SAP',
};

/** Nombre del archivo que se descarga desde la web (espejo del controlador). */
export function archivoPlantilla(tipo: TipoFuenteExterna): string {
  return `plantilla-${tipo.replace('_', '-')}.xlsx`;
}

const TIPOS_SOLICITUD = ['MANTENIMIENTO', 'MERMA', 'OTRO'] as const;
const ESTADOS_SOLICITUD = ['ABIERTA', 'ATENDIDA', 'CERRADA'] as const;
const TIPOS_MERMA_SAP = ['MP', 'EP', 'PT'] as const;

/** Ancho de columna por cabecera en la plantilla descargable. */
const ANCHOS: Record<string, number> = {
  linea: 12,
  fecha_hora: 20,
  estado: 14,
  velocidad_unid_min: 20,
  numero_solicitud: 18,
  fecha: 14,
  tipo: 16,
  descripcion: 46,
  documento: 16,
  codigo_producto: 17,
  cantidad_kg: 13,
  tipo_merma: 12,
  motivo: 40,
};

/** Filas de ejemplo de cada plantilla, con líneas y productos reales. */
function ejemplos(tipo: TipoFuenteExterna, hoy: string): (string | number)[][] {
  const dia = `${hoy.slice(8, 10)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)}`;
  if (tipo === 'sensores') {
    return [
      ['LLEN-A1', `${dia} 07:42`, 'PARADA', ''],
      ['LLEN-A1', `${dia} 07:56`, 'PRODUCIENDO', 133.3],
      ['LLEN-M2', `${dia} 09:10`, 'PRODUCIENDO', 48.5],
    ];
  }
  if (tipo === 'solicitudes') {
    return [
      ['SM-2026-0421', dia, 'LLEN-A1', 'MANTENIMIENTO', 'ATENDIDA', 'Cambio de retén de la tapadora'],
      ['SM-2026-0422', dia, 'EXTR-2', 'MANTENIMIENTO', 'ABIERTA', 'Revisión del sincronismo de pinzas'],
      ['SM-2026-0423', dia, 'MOLD-A3', 'MERMA', 'CERRADA', 'Descarte de producto en tolva'],
    ];
  }
  return [
    ['4900012345', dia, 'LLEN-A1', '1120002', 3.2, 'EP', 'Merma de arranque'],
    ['4900012346', dia, 'LLEN-A1', '1120002', 1.8, 'PT', 'Cambio de bobina'],
    ['4900012347', dia, 'EXTR-2', '1110001', 2.4, 'EP', 'Producto retenido en tolva'],
  ];
}

/** Texto de la hoja «Instrucciones» de cada plantilla. */
function instrucciones(tipo: TipoFuenteExterna): string[][] {
  const comunes: string[][] = [
    ['Cómo llenar esta plantilla'],
    [''],
    ['1.', 'No cambies los nombres de las columnas de la primera fila.'],
    ['2.', 'Una fila por registro; deja en blanco lo que no aplique.'],
    ['3.', 'Las fechas admiten dd/mm/aaaa hh:mm, aaaa-mm-dd hh:mm o el formato fecha de Excel.'],
    ['4.', 'Los números admiten coma o punto decimal.'],
    ['5.', 'Puedes subir el archivo en .xlsx o .csv (máximo 5 MB).'],
    ['6.', 'Al importar se acumulan los datos: las filas repetidas se ignoran.'],
    [''],
  ];
  const especificas: Record<TipoFuenteExterna, string[][]> = {
    sensores: [
      ['Columnas'],
      ['linea', 'Código de la línea del maestro: LLEN-M2, LLEN-M1, LLEN-A1, LLEN-A2, EXTR-2, EXTR-3, MOLD-A2, MOLD-A3, MOLD-A4.'],
      ['fecha_hora', 'Marca de tiempo de la lectura.'],
      ['estado', 'PRODUCIENDO o PARADA.'],
      ['velocidad_unid_min', 'Opcional. Velocidad instantánea en unidades por minuto.'],
      [''],
      ['Nota', 'Cada lectura abre un tramo que dura hasta la siguiente lectura de la misma línea.'],
    ],
    solicitudes: [
      ['Columnas'],
      ['numero_solicitud', 'Número tal como lo emite el sistema: SM-2026-0421.'],
      ['fecha', 'Fecha de la solicitud.'],
      ['linea', 'Opcional. Código de la línea.'],
      ['tipo', 'MANTENIMIENTO, MERMA u OTRO.'],
      ['estado', 'ABIERTA, ATENDIDA o CERRADA.'],
      ['descripcion', 'Opcional. Texto libre.'],
    ],
    sap_mermas: [
      ['Columnas'],
      ['documento', 'N.º de documento de la transferencia en SAP.'],
      ['fecha', 'Fecha del documento.'],
      ['linea', 'Código de la línea.'],
      ['codigo_producto', 'Código de producto de 7 dígitos del maestro: 1120002.'],
      ['cantidad_kg', 'Kilos transferidos.'],
      ['tipo_merma', 'Opcional. MP, EP o PT.'],
      ['motivo', 'Opcional. Texto libre.'],
    ],
  };
  return [...comunes, ...especificas[tipo]];
}

/* ------------------------------------------------------------------ */
/* Plantillas descargables                                             */
/* ------------------------------------------------------------------ */

/** XLSX con la cabecera exacta, 3 filas de ejemplo y una hoja «Instrucciones». */
export function generarPlantilla(tipo: TipoFuenteExterna): ArrayBuffer {
  const columnas = COLUMNAS_FUENTE[tipo];
  const libro = XLSX.utils.book_new();

  const datos = XLSX.utils.aoa_to_sheet([[...columnas], ...ejemplos(tipo, hoyIso())]);
  datos['!cols'] = columnas.map((c) => ({ wch: ANCHOS[c] ?? 18 }));
  datos['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: columnas.length - 1 } }) };
  XLSX.utils.book_append_sheet(libro, datos, HOJA[tipo]);

  const guia = XLSX.utils.aoa_to_sheet(instrucciones(tipo));
  guia['!cols'] = [{ wch: 22 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(libro, guia, 'Instrucciones');

  return XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

/* ------------------------------------------------------------------ */
/* Consulta                                                            */
/* ------------------------------------------------------------------ */

function aResumen(f: ImportacionFuenteMock): ImportacionResumen {
  return {
    id: f.id,
    archivo: f.archivo,
    fecha: f.importadoEn,
    usuario: f.importadoPor,
    filasOk: f.filasOk,
    filasRechazadas: f.filasRechazadas,
  };
}

function contarFilas(tipo: TipoFuenteExterna): number {
  const { fuentes } = getStore();
  if (tipo === 'sensores') return fuentes.lecturasSensor.length;
  if (tipo === 'solicitudes') return fuentes.solicitudes.length;
  return fuentes.transferenciasSap.length;
}

function periodoAcumulado(tipo: TipoFuenteExterna): { desde: string; hasta: string } | null {
  const { fuentes } = getStore();
  const fechas =
    tipo === 'sensores'
      ? fuentes.lecturasSensor.map((l) => l.fechaHora.slice(0, 10))
      : tipo === 'solicitudes'
        ? fuentes.solicitudes.map((s) => s.fecha.slice(0, 10))
        : fuentes.transferenciasSap.map((t) => t.fecha.slice(0, 10));
  if (fechas.length === 0) return null;
  const ordenadas = [...fechas].sort();
  return { desde: ordenadas[0]!, hasta: ordenadas[ordenadas.length - 1]! };
}

/** Historial de importaciones de una fuente, de la más reciente a la más antigua. */
export function historialImportaciones(tipo: TipoFuenteExterna): ImportacionResumen[] {
  return getStore()
    .importaciones.filter((i) => i.tipo === tipo)
    /* `importadoEn` tiene resolución de segundos: el id correlativo desempata. */
    .sort((a, b) => b.importadoEn.localeCompare(a.importadoEn) || b.id.localeCompare(a.id))
    .map(aResumen);
}

export function ultimaImportacion(tipo: TipoFuenteExterna): ImportacionResumen | undefined {
  return historialImportaciones(tipo)[0];
}

/** Estado de una fuente: filas acumuladas, última importación y periodo. */
export function resumenFuente(tipo: TipoFuenteExterna): FuenteExternaResumen {
  const ultima = ultimaImportacion(tipo);
  const periodo = periodoAcumulado(tipo);
  return {
    tipo,
    label: TIPO_FUENTE_EXTERNA_LABEL[tipo],
    filas: contarFilas(tipo),
    ...(ultima ? { ultimaImportacion: ultima } : {}),
    ...(periodo ? { periodo } : {}),
  };
}

/** Estado de las 3 fuentes externas. */
export function resumenFuentes(): FuenteExternaResumen[] {
  return TIPOS_FUENTE_EXTERNA.map((tipo) => resumenFuente(tipo));
}

/* ------------------------------------------------------------------ */
/* Importación                                                         */
/* ------------------------------------------------------------------ */

interface ContextoImportacion {
  /** Código de línea en mayúsculas → id. */
  lineasPorCodigo: Map<string, string>;
  /** Códigos de producto de 7 dígitos del maestro. */
  productos: Set<string>;
  /** Claves naturales ya presentes en el store (deduplicación). */
  clavesExistentes: Set<string>;
}

type FilaMock = LecturaSensorMock | SolicitudExternaMock | TransferenciaSapMock;

interface FilaLeida {
  entidad: FilaMock;
  /** Clave natural para deduplicar. */
  clave: string;
  /** `YYYY-MM-DD` de la fila, para el periodo cubierto. */
  fecha: string;
}

function contexto(): ContextoImportacion {
  const store = getStore();
  const lineasPorCodigo = new Map<string, string>();
  for (const linea of store.lineas) lineasPorCodigo.set(linea.codigo.toUpperCase(), linea.id);
  const productos = new Set(store.productos.map((p) => p.codigo));

  const clavesExistentes = new Set<string>();
  for (const l of store.fuentes.lecturasSensor) clavesExistentes.add(`${l.lineaId}|${l.fechaHora}`);
  for (const s of store.fuentes.solicitudes) clavesExistentes.add(`SOL|${s.numero.toUpperCase()}`);
  for (const t of store.fuentes.transferenciasSap) {
    clavesExistentes.add(`SAP|${t.documento.toUpperCase()}`);
  }
  return { lineasPorCodigo, productos, clavesExistentes };
}

/** Texto de la celda tal como venía, para el motivo del rechazo. */
function textoBruto(valor: ValorCelda): string {
  if (valor === null) return '';
  if (valor instanceof Date) return isoLocal(valor);
  return String(valor);
}

/** Resuelve el valor de una columna esperada, respetando el `mapeo` manual. */
function celda(fila: FilaTabla, columna: string, mapeo: Record<string, string>): ValorCelda {
  const alias = mapeo[columna];
  if (alias) {
    const clave = normalizarCabecera(alias);
    if (clave in fila) return fila[clave] ?? null;
  }
  return fila[columna] ?? null;
}

function leerSensor(
  v: (c: string) => ValorCelda,
  ctx: ContextoImportacion,
  importacionId: string
): FilaLeida | { motivo: string } {
  const codigoLinea = aTexto(v('linea'));
  if (!codigoLinea) return { motivo: 'Falta el código de línea' };
  const lineaId = ctx.lineasPorCodigo.get(codigoLinea.toUpperCase());
  if (!lineaId) return { motivo: `La línea «${codigoLinea}» no existe en el maestro` };

  const fecha = aFecha(v('fecha_hora'));
  if (!fecha) return { motivo: `Fecha/hora inválida: «${textoBruto(v('fecha_hora'))}»` };

  const estadoBruto = aTexto(v('estado'));
  const estado = estadoBruto?.toUpperCase() as EstadoLecturaSensor | undefined;
  if (!estado || !ESTADOS_LECTURA_SENSOR.includes(estado)) {
    return { motivo: `Estado «${estadoBruto ?? ''}» fuera de ${ESTADOS_LECTURA_SENSOR.join(' | ')}` };
  }

  const brutoVelocidad = v('velocidad_unid_min');
  let velocidad: number | null = null;
  if (brutoVelocidad !== null && String(brutoVelocidad).trim() !== '') {
    velocidad = aNumero(brutoVelocidad);
    if (velocidad === null) {
      return { motivo: `La velocidad «${textoBruto(brutoVelocidad)}» no es un número` };
    }
  }

  const fechaHora = isoLocal(fecha);
  const entidad: LecturaSensorMock = {
    id: `SEN-${lineaId}-${fechaHora}`,
    importacionId,
    lineaId,
    fechaHora,
    estado,
    velocidadUnidMin: velocidad,
  };
  return { entidad, clave: `${lineaId}|${fechaHora}`, fecha: fechaHora.slice(0, 10) };
}

function leerSolicitud(
  v: (c: string) => ValorCelda,
  ctx: ContextoImportacion,
  importacionId: string
): FilaLeida | { motivo: string } {
  const numero = aTexto(v('numero_solicitud'));
  if (!numero) return { motivo: 'Falta el n.º de solicitud' };

  const fecha = aFecha(v('fecha'));
  if (!fecha) return { motivo: `Fecha inválida: «${textoBruto(v('fecha'))}»` };

  const codigoLinea = aTexto(v('linea'));
  let lineaId: string | null = null;
  if (codigoLinea) {
    lineaId = ctx.lineasPorCodigo.get(codigoLinea.toUpperCase()) ?? null;
    if (!lineaId) return { motivo: `La línea «${codigoLinea}» no existe en el maestro` };
  }

  const tipoBruto = aTexto(v('tipo'))?.toUpperCase() ?? 'MANTENIMIENTO';
  if (!TIPOS_SOLICITUD.includes(tipoBruto as (typeof TIPOS_SOLICITUD)[number])) {
    return { motivo: `Tipo «${tipoBruto}» fuera de ${TIPOS_SOLICITUD.join(' | ')}` };
  }
  const estadoBruto = aTexto(v('estado'))?.toUpperCase() ?? 'ABIERTA';
  if (!ESTADOS_SOLICITUD.includes(estadoBruto as (typeof ESTADOS_SOLICITUD)[number])) {
    return { motivo: `Estado «${estadoBruto}» fuera de ${ESTADOS_SOLICITUD.join(' | ')}` };
  }

  const fechaIso = isoLocal(fecha).slice(0, 10);
  const entidad: SolicitudExternaMock = {
    id: `SOL-${numero.toUpperCase()}`,
    importacionId,
    numero,
    fecha: fechaIso,
    lineaId,
    tipo: tipoBruto,
    estado: estadoBruto,
    descripcion: aTexto(v('descripcion')) ?? '',
  };
  return { entidad, clave: `SOL|${numero.toUpperCase()}`, fecha: fechaIso };
}

function leerTransferencia(
  v: (c: string) => ValorCelda,
  ctx: ContextoImportacion,
  importacionId: string
): FilaLeida | { motivo: string } {
  const documento = aTexto(v('documento'));
  if (!documento) return { motivo: 'Falta el n.º de documento SAP' };

  const fecha = aFecha(v('fecha'));
  if (!fecha) return { motivo: `Fecha inválida: «${textoBruto(v('fecha'))}»` };

  const codigoLinea = aTexto(v('linea'));
  if (!codigoLinea) return { motivo: 'Falta el código de línea' };
  const lineaId = ctx.lineasPorCodigo.get(codigoLinea.toUpperCase());
  if (!lineaId) return { motivo: `La línea «${codigoLinea}» no existe en el maestro` };

  const productoCodigo = aTexto(v('codigo_producto'));
  if (!productoCodigo) return { motivo: 'Falta el código de producto' };
  if (!ctx.productos.has(productoCodigo)) {
    return { motivo: `El producto «${productoCodigo}» no existe en el maestro` };
  }

  const cantidadKg = aNumero(v('cantidad_kg'));
  if (cantidadKg === null) {
    return { motivo: `La cantidad «${textoBruto(v('cantidad_kg'))}» no es un número` };
  }
  if (cantidadKg <= 0) return { motivo: 'La cantidad en kg debe ser mayor que 0' };

  const tipoMermaBruto = aTexto(v('tipo_merma'))?.toUpperCase() ?? null;
  if (tipoMermaBruto && !TIPOS_MERMA_SAP.includes(tipoMermaBruto as TipoMermaCodigo)) {
    return { motivo: `Tipo de merma «${tipoMermaBruto}» fuera de ${TIPOS_MERMA_SAP.join(' | ')}` };
  }

  const fechaIso = isoLocal(fecha).slice(0, 10);
  const entidad: TransferenciaSapMock = {
    id: `SAP-${documento.toUpperCase()}`,
    importacionId,
    documento,
    fecha: fechaIso,
    lineaId,
    productoCodigo,
    cantidadKg,
    tipoMerma: (tipoMermaBruto as TipoMermaCodigo | null) ?? null,
    motivo: aTexto(v('motivo')) ?? '',
  };
  return { entidad, clave: `SAP|${documento.toUpperCase()}`, fecha: fechaIso };
}

function leerFila(
  tipo: TipoFuenteExterna,
  fila: FilaTabla,
  mapeo: Record<string, string>,
  ctx: ContextoImportacion,
  importacionId: string
): FilaLeida | { motivo: string } {
  const v = (columna: string): ValorCelda => celda(fila, columna, mapeo);
  if (tipo === 'sensores') return leerSensor(v, ctx, importacionId);
  if (tipo === 'solicitudes') return leerSolicitud(v, ctx, importacionId);
  return leerTransferencia(v, ctx, importacionId);
}

function siguienteId(tipo: TipoFuenteExterna): string {
  const total = getStore().importaciones.filter((i) => i.tipo === tipo).length;
  return `${PREFIJO[tipo]}-${String(total + 1).padStart(3, '0')}`;
}

function guardar(tipo: TipoFuenteExterna, filas: FilaMock[]): void {
  if (filas.length === 0) return;
  const { fuentes } = getStore();
  if (tipo === 'sensores') fuentes.lecturasSensor.push(...(filas as LecturaSensorMock[]));
  else if (tipo === 'solicitudes') fuentes.solicitudes.push(...(filas as SolicitudExternaMock[]));
  else fuentes.transferenciasSap.push(...(filas as TransferenciaSapMock[]));
}

/** El archivo no trae ninguna fila de datos bajo la cabecera. */
export class ArchivoSinFilasError extends Error {}

/** Al archivo le faltan columnas obligatorias (ni en la cabecera ni en el mapeo). */
export class ColumnasFaltantesError extends Error {
  constructor(readonly columnas: string[]) {
    super(`Faltan columnas obligatorias: ${columnas.join(', ')}`);
  }
}

/**
 * Lee el archivo, valida fila a fila y acumula las filas nuevas.
 * Los duplicados (misma clave natural) se ignoran; las filas con problemas se
 * devuelven en `rechazos` con el motivo y el número de fila del archivo.
 */
export function importarFuente(
  tipo: TipoFuenteExterna,
  nombreArchivo: string,
  buffer: ArrayBuffer,
  mapeo: Record<string, string>,
  usuario: string
): ImportacionResultado {
  const tabla = leerTabla(buffer, esXlsx(nombreArchivo));
  if (tabla.filas.length === 0) throw new ArchivoSinFilasError();

  /* Sin la columna obligatoria el archivo no es importable: rechazar fila a
     fila daría N motivos «valor inválido» y ocultaría la causa real. */
  const faltantes = COLUMNAS_FUENTE[tipo].filter((columna) => {
    if (COLUMNAS_OPCIONALES_FUENTE[tipo].includes(columna)) return false;
    const alias = mapeo[columna];
    return !tabla.cabeceras.includes(alias ? normalizarCabecera(alias) : columna);
  });
  if (faltantes.length > 0) throw new ColumnasFaltantesError(faltantes);

  const id = siguienteId(tipo);
  const rechazos: RechazoFila[] = [];
  const fechas: string[] = [];
  let duplicadas = 0;

  const ctx = contexto();
  const vistos = new Set<string>();
  const nuevos: FilaMock[] = [];

  for (const { numero, valores } of tabla.filas) {
    const leido = leerFila(tipo, valores, mapeo, ctx, id);
    if ('motivo' in leido) {
      rechazos.push({ fila: numero, motivo: leido.motivo });
      continue;
    }
    if (vistos.has(leido.clave) || ctx.clavesExistentes.has(leido.clave)) {
      duplicadas += 1;
      continue;
    }
    vistos.add(leido.clave);
    nuevos.push(leido.entidad);
    fechas.push(leido.fecha);
  }

  guardar(tipo, nuevos);
  fechas.sort();
  const periodo = fechas.length ? { desde: fechas[0]!, hasta: fechas[fechas.length - 1]! } : undefined;

  getStore().importaciones.push({
    id,
    tipo,
    archivo: nombreArchivo,
    importadoEn: ahoraIso(),
    importadoPor: usuario,
    filasOk: nuevos.length,
    filasRechazadas: rechazos.length,
    filasDuplicadas: duplicadas,
    desde: periodo?.desde ?? null,
    hasta: periodo?.hasta ?? null,
  });

  return {
    id,
    tipo,
    archivo: nombreArchivo,
    filasOk: nuevos.length,
    filasRechazadas: rechazos.length,
    filasDuplicadas: duplicadas,
    rechazos,
    ...(periodo ? { periodo } : {}),
  };
}

/** Tamaño máximo de una plantilla de fuente externa (espejo de `MAX_BYTES_TABLA`). */
export const MAX_BYTES_TABLA = 5 * 1024 * 1024;

/** Extensiones aceptadas por los importadores de fuentes externas. */
export const EXTENSIONES_TABLA = ['.xlsx', '.csv'] as const;

/** `true` si el nombre termina en una extensión aceptada. */
export function extensionAceptada(nombre: string): boolean {
  const minuscula = nombre.toLowerCase();
  return EXTENSIONES_TABLA.some((ext) => minuscula.endsWith(ext));
}

/** `true` cuando el archivo es un XLSX (por extensión, no por mimetype). */
export function esXlsx(nombre: string): boolean {
  return nombre.toLowerCase().endsWith('.xlsx');
}
