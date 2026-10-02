import * as ExcelJS from 'exceljs';
import { ValidationException } from '../../common/exceptions';
import { normalizar } from '../../common/utils';

/**
 * Lectura tolerante de las plantillas de fuentes externas (XLSX y CSV).
 * No hay integración en vivo: el usuario descarga la plantilla, la llena con lo
 * que exporta el sensor / el ERP y la vuelve a subir.
 */

/** Valor bruto de una celda tal como llega del archivo. */
export type ValorCelda = string | number | Date | null;

/** Fila leída: cabecera normalizada → valor. */
export type FilaTabla = Record<string, ValorCelda>;

export interface TablaLeida {
  /** Cabeceras normalizadas, en el orden del archivo. */
  cabeceras: string[];
  /** Filas de datos; `numero` es la fila real del archivo (1 = cabecera). */
  filas: { numero: number; valores: FilaTabla }[];
}

/**
 * Normaliza una cabecera: sin tildes, en minúsculas, sin espacios ni signos.
 * `"Fecha / Hora"` → `fecha_hora`; `"Velocidad (unid/min)"` → `velocidad_unid_min`.
 */
export function normalizarCabecera(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Detecta el separador más frecuente de la primera línea (`,` `;` o tab). */
function separadorCsv(primeraLinea: string): string {
  const candidatos = [';', ',', '\t'];
  let mejor = ',';
  let maximo = -1;
  for (const sep of candidatos) {
    const cuenta = primeraLinea.split(sep).length;
    if (cuenta > maximo) {
      maximo = cuenta;
      mejor = sep;
    }
  }
  return mejor;
}

/** Parser CSV propio (RFC 4180: comillas dobles, escapes `""`, saltos dentro de comillas). */
export function parsearCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] ?? '';
  const sep = separadorCsv(primeraLinea);

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i]!;
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreComillas = true;
    } else if (c === sep) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

/** Aplana el valor de una celda de exceljs (fórmulas, rich text, hipervínculos). */
function valorExcel(valor: ExcelJS.CellValue): ValorCelda {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number' || typeof valor === 'string') return valor;
  if (typeof valor === 'boolean') return String(valor);
  if (typeof valor === 'object') {
    if ('text' in valor && typeof valor.text === 'string') return valor.text;
    if ('richText' in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((t) => t.text).join('');
    }
    if ('result' in valor) return valorExcel(valor.result as ExcelJS.CellValue);
    if ('formula' in valor) return null;
  }
  return null;
}

/** Lee la primera hoja de un XLSX: fila 1 = cabeceras, el resto = datos. */
async function leerXlsx(buffer: Buffer): Promise<TablaLeida> {
  const libro = new ExcelJS.Workbook();
  /* exceljs tipa `load` con el ArrayBuffer del DOM; el Buffer de Node vale igual. */
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  const hoja = libro.worksheets[0];
  if (!hoja) return { cabeceras: [], filas: [] };

  const cabeceras: string[] = [];
  const filaCabecera = hoja.getRow(1);
  filaCabecera.eachCell({ includeEmpty: true }, (celda, columna) => {
    const bruto = valorExcel(celda.value);
    cabeceras[columna - 1] = bruto === null ? '' : normalizarCabecera(String(bruto));
  });

  const filas: TablaLeida['filas'] = [];
  for (let n = 2; n <= hoja.rowCount; n += 1) {
    const fila = hoja.getRow(n);
    const valores: FilaTabla = {};
    let vacia = true;
    cabeceras.forEach((cabecera, i) => {
      if (!cabecera) return;
      const bruto = valorExcel(fila.getCell(i + 1).value);
      valores[cabecera] = bruto;
      if (bruto !== null && String(bruto).trim() !== '') vacia = false;
    });
    if (!vacia) filas.push({ numero: n, valores });
  }
  return { cabeceras: cabeceras.filter(Boolean), filas };
}

/** Lee un CSV: fila 1 = cabeceras, el resto = datos. */
function leerCsv(buffer: Buffer): TablaLeida {
  const matriz = parsearCsv(buffer.toString('utf8'));
  const [primera, ...resto] = matriz;
  if (!primera) return { cabeceras: [], filas: [] };
  const cabeceras = primera.map((c) => normalizarCabecera(c));

  const filas = resto.map((celdas, i) => {
    const valores: FilaTabla = {};
    cabeceras.forEach((cabecera, j) => {
      if (!cabecera) return;
      const bruto = (celdas[j] ?? '').trim();
      valores[cabecera] = bruto === '' ? null : bruto;
    });
    return { numero: i + 2, valores };
  });
  return { cabeceras: cabeceras.filter(Boolean), filas };
}

/** Lee la tabla de un archivo subido, sea XLSX o CSV. */
export async function leerTabla(buffer: Buffer, esExcel: boolean): Promise<TablaLeida> {
  if (!esExcel) return leerCsv(buffer);
  if (buffer.length === 0) throw archivoIlegible('El archivo está vacío (0 bytes)');
  try {
    return await leerXlsx(buffer);
  } catch {
    /* exceljs lanza con un ZIP corrupto, un PDF renombrado, etc.: es un error
       del archivo, no del servidor. */
    throw archivoIlegible('El archivo está dañado o no es un Excel (.xlsx) válido');
  }
}

function archivoIlegible(detalle: string): ValidationException {
  return new ValidationException({ archivo: detalle }, 'No se pudo leer el archivo');
}

/* ------------------------------------------------------------------ */
/* Conversiones tolerantes                                             */
/* ------------------------------------------------------------------ */

/*
 * Todas las fechas de las fuentes son **hora de pared** de planta (lo que el
 * operador escribió), sin zona horaria. Para no depender de la TZ del proceso
 * se representan como `Date` cuyos componentes UTC son esa hora de pared:
 * exceljs ya entrega así las celdas fecha (lo escrito, marcado como UTC) y el
 * resto de formatos se construye con `Date.UTC`. Se leen siempre con los
 * getters `getUTC*`.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Hora de pared → ISO `YYYY-MM-DDTHH:mm:ss` (sin desplazamiento). */
export function isoLocal(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${pad2(fecha.getUTCMonth() + 1)}-${pad2(fecha.getUTCDate())}T${pad2(fecha.getUTCHours())}:${pad2(fecha.getUTCMinutes())}:${pad2(fecha.getUTCSeconds())}`;
}

/**
 * Construye la hora de pared validando cada componente: `31/02` o `25:70` no
 * «corren» al día siguiente, devuelven `null`.
 */
export function fechaValida(
  anio: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
): Date | null {
  if (![anio, mes, dia, hora, minuto, segundo].every(Number.isInteger)) return null;
  if (anio < 1900 || anio > 9999 || mes < 1 || mes > 12 || dia < 1) return null;
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59 || segundo < 0 || segundo > 59) return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo));
  /* `Date.UTC` interpreta los años 0–99 como 1900–1999; se fija explícito. */
  fecha.setUTCFullYear(anio);
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return fecha;
}

/** `true` si `YYYY-MM-DD` es una fecha que existe en el calendario. */
export function esFechaIsoValida(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  return Boolean(m && fechaValida(Number(m[1]), Number(m[2]), Number(m[3])));
}

/** Serie de fecha de Excel (1899-12-30 como día 0) → hora de pared. */
function desdeSerieExcel(serie: number): Date | null {
  if (!Number.isFinite(serie) || serie <= 0 || serie > 2958465) return null;
  const dias = Math.floor(serie);
  const segundos = Math.round((serie - dias) * 86400);
  return new Date(Date.UTC(1899, 11, 30) + dias * 86400000 + segundos * 1000);
}

/** Convierte una hora con sufijo AM/PM a 0–23; `null` si la hora no cabe en 1–12. */
function hora24(hora: number, sufijo: string | undefined): number | null {
  if (!sufijo) return hora;
  if (hora < 1 || hora > 12) return null;
  const pm = /^p/i.test(sufijo);
  if (hora === 12) return pm ? 12 : 0;
  return pm ? hora + 12 : hora;
}

/** Hora opcional: `HH:mm`, `HH:mm:ss` y sufijo `AM`/`PM`/`a. m.`/`p. m.`. */
const HORA = String.raw`(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*([AaPp])\.?\s*[Mm]\.?)?)?Z?`;
const ISO_FECHA_HORA = new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${HORA}\s*$`);
const LATINA = new RegExp(String.raw`^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})${HORA}\s*$`);

/**
 * Interpreta una fecha en los formatos que produce planta:
 * `Date` de Excel, serie numérica, `2026-08-28T10:42`, `28/09/2026 10:42`,
 * `28-09-26`, `28/09/2026 7:05 PM`. Devuelve `null` si no se reconoce o si la
 * fecha/hora no existe (`31/02/2026`, `25:70`).
 */
export function aFecha(valor: ValorCelda): Date | null {
  if (valor === null) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'number') return desdeSerieExcel(valor);

  const texto = valor.trim();
  if (texto === '') return null;

  const iso = ISO_FECHA_HORA.exec(texto);
  const latina = iso ? null : LATINA.exec(texto);
  const partes = iso
    ? { a: iso[1], m: iso[2], d: iso[3], hh: iso[4], mm: iso[5], ss: iso[6], ap: iso[7] }
    : latina
      ? { a: latina[3], m: latina[2], d: latina[1], hh: latina[4], mm: latina[5], ss: latina[6], ap: latina[7] }
      : null;
  if (partes) {
    const anioBruto = Number(partes.a);
    const anio = partes.a!.length === 2 ? 2000 + anioBruto : anioBruto;
    const hora = hora24(Number(partes.hh ?? 0), partes.ap);
    if (hora === null) return null;
    return fechaValida(anio, Number(partes.m), Number(partes.d), hora, Number(partes.mm ?? 0), Number(partes.ss ?? 0));
  }

  if (/^\d+([.,]\d+)?$/.test(texto)) return desdeSerieExcel(Number(texto.replace(',', '.')));
  return null;
}

/**
 * Número tolerante con coma decimal y separador de miles: `1 234,5` → `1234.5`,
 * `1.234` → `1234` (punto como separador de miles, convención local).
 */
export function aNumero(valor: ValorCelda): number | null {
  if (valor === null) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (valor instanceof Date) return null;
  const texto = valor.trim().replace(/\s|\u00a0/g, '');
  if (texto === '') return null;
  let normalizado: string;
  if (texto.includes(',')) normalizado = texto.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(texto)) normalizado = texto.replace(/\./g, '');
  else normalizado = texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/** Texto recortado; `null` si la celda está vacía. */
export function aTexto(valor: ValorCelda): string | null {
  if (valor === null) return null;
  if (valor instanceof Date) return isoLocal(valor);
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

/** `28/09/2026` para los detalles legibles de la ficha del Anexo 03. */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : iso;
}
