import * as ExcelJS from 'exceljs';
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
  return esExcel ? leerXlsx(buffer) : leerCsv(buffer);
}

/* ------------------------------------------------------------------ */
/* Conversiones tolerantes                                             */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `Date` → ISO local `YYYY-MM-DDTHH:mm:ss` (sin desplazamiento UTC). */
export function isoLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}T${pad2(fecha.getHours())}:${pad2(fecha.getMinutes())}:${pad2(fecha.getSeconds())}`;
}

/** Serie de fecha de Excel (1899-12-30 como día 0) → `Date` local. */
function desdeSerieExcel(serie: number): Date | null {
  if (!Number.isFinite(serie) || serie <= 0 || serie > 2958465) return null;
  const dias = Math.floor(serie);
  const fraccion = serie - dias;
  const base = new Date(1899, 11, 30);
  base.setDate(base.getDate() + dias);
  const segundos = Math.round(fraccion * 86400);
  base.setHours(0, 0, segundos, 0);
  return base;
}

const ISO_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const LATINA = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * Interpreta una fecha en los formatos que produce planta:
 * `Date` de Excel, serie numérica, `2026-08-28T10:42`, `28/09/2026 10:42`,
 * `28-09-26`. Devuelve `null` si no se reconoce.
 */
export function aFecha(valor: ValorCelda): Date | null {
  if (valor === null) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'number') return desdeSerieExcel(valor);

  const texto = valor.trim();
  if (texto === '') return null;

  const iso = ISO_FECHA_HORA.exec(texto);
  if (iso) {
    const [, a, m, d, hh, mm, ss] = iso;
    return new Date(
      Number(a), Number(m) - 1, Number(d),
      Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0),
    );
  }

  const latina = LATINA.exec(texto);
  if (latina) {
    const [, d, m, a, hh, mm, ss] = latina;
    const anio = Number(a) < 100 ? 2000 + Number(a) : Number(a);
    const fecha = new Date(
      anio, Number(m) - 1, Number(d),
      Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0),
    );
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  if (/^\d+([.,]\d+)?$/.test(texto)) return desdeSerieExcel(Number(texto.replace(',', '.')));
  return null;
}

/** Número tolerante con coma decimal y separador de miles: `1 234,5` → `1234.5`. */
export function aNumero(valor: ValorCelda): number | null {
  if (valor === null) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (valor instanceof Date) return null;
  const texto = valor.trim().replace(/\s| /g, '');
  if (texto === '') return null;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
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
