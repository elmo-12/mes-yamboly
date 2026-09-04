import * as XLSX from 'xlsx';
import { normalizar } from './handlers/_utils';

/**
 * Lectura tolerante de las plantillas de fuentes externas (XLSX y CSV) en el
 * navegador. Espejo literal de `apps/api/src/modules/evidence/tabla.util.ts`:
 * mismas cabeceras normalizadas, mismos formatos de fecha y número aceptados y
 * la misma numeración de filas (1 = cabecera). La API usa exceljs; aquí SheetJS.
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
/* Lectura del archivo                                                 */
/* ------------------------------------------------------------------ */

/** Aplana el valor de una celda de SheetJS. */
function valorCelda(bruto: unknown): ValorCelda {
  if (bruto === null || bruto === undefined) return null;
  if (bruto instanceof Date) return bruto;
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;
  if (typeof bruto === 'boolean') return String(bruto);
  const texto = String(bruto);
  return texto.trim() === '' ? null : texto;
}

/**
 * Lee la primera hoja del archivo. SheetJS detecta solo si el binario es XLSX o
 * texto CSV, así que `esExcel` solo se usa para elegir la ruta de lectura.
 */
export function leerTabla(buffer: ArrayBuffer, esExcel: boolean): TablaLeida {
  const libro = esExcel
    ? XLSX.read(buffer, { type: 'array', cellDates: true })
    : XLSX.read(new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, ''), {
        type: 'string',
        cellDates: true,
        raw: true,
      });

  const nombre = libro.SheetNames[0];
  const hoja = nombre ? libro.Sheets[nombre] : undefined;
  if (!hoja) return { cabeceras: [], filas: [] };

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });
  const [primera, ...resto] = matriz;
  if (!primera) return { cabeceras: [], filas: [] };

  const cabeceras = primera.map((c) => {
    const valor = valorCelda(c);
    return valor === null ? '' : normalizarCabecera(String(valor));
  });

  const filas: TablaLeida['filas'] = [];
  resto.forEach((celdas, i) => {
    const valores: FilaTabla = {};
    let vacia = true;
    cabeceras.forEach((cabecera, j) => {
      if (!cabecera) return;
      const bruto = valorCelda(celdas?.[j]);
      valores[cabecera] = bruto;
      if (bruto !== null && String(bruto).trim() !== '') vacia = false;
    });
    if (!vacia) filas.push({ numero: i + 2, valores });
  });

  return { cabeceras: cabeceras.filter(Boolean), filas };
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
      Number(a),
      Number(m) - 1,
      Number(d),
      Number(hh ?? 0),
      Number(mm ?? 0),
      Number(ss ?? 0)
    );
  }

  const latina = LATINA.exec(texto);
  if (latina) {
    const [, d, m, a, hh, mm, ss] = latina;
    const anio = Number(a) < 100 ? 2000 + Number(a) : Number(a);
    const fecha = new Date(
      anio,
      Number(m) - 1,
      Number(d),
      Number(hh ?? 0),
      Number(mm ?? 0),
      Number(ss ?? 0)
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
