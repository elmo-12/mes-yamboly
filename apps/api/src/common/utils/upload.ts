import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ValidationException } from '../exceptions/business.exception';

/**
 * Archivo recibido por `FileInterceptor` con el almacenamiento en memoria por
 * defecto de multer. Se declara aquí para no depender de `@types/multer`
 * (multer viaja dentro de `@nestjs/platform-express`, sus tipos no).
 */
export interface ArchivoSubido {
  /** Nombre del campo del formulario: `archivo`. */
  fieldname: string;
  /** Nombre original en el equipo del usuario. */
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Tamaño máximo de una plantilla de fuente externa. */
export const MAX_BYTES_TABLA = 5 * 1024 * 1024;

/** Extensiones aceptadas por los importadores de fuentes externas. */
export const EXTENSIONES_TABLA = ['.xlsx', '.csv'] as const;

/**
 * Mimetypes de Excel y CSV. Windows y macOS mandan variantes distintas para el
 * mismo archivo, así que además se acepta por extensión.
 */
const MIMETYPES_TABLA = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'text/csv',
  'application/csv',
  'text/plain',
]);

/** `true` si el nombre termina en una extensión aceptada. */
export function extensionAceptada(nombre: string): boolean {
  const minuscula = nombre.toLowerCase();
  return EXTENSIONES_TABLA.some((ext) => minuscula.endsWith(ext));
}

/** `true` cuando el archivo es un XLSX (por extensión, no por mimetype). */
export function esXlsx(nombre: string): boolean {
  return nombre.toLowerCase().endsWith('.xlsx');
}

/**
 * Opciones de `FileInterceptor` para subir una plantilla: memoria (el archivo
 * no se guarda en disco), ≤ 5 MB y sólo XLSX/CSV.
 */
export const OPCIONES_SUBIDA_TABLA: MulterOptions = {
  /* Sin `storage` ni `dest`, multer usa `memoryStorage`: llega `file.buffer`. */
  limits: { fileSize: MAX_BYTES_TABLA, files: 1 },
  fileFilter(_req, file, callback) {
    const aceptado = extensionAceptada(file.originalname) && MIMETYPES_TABLA.has(file.mimetype);
    if (!aceptado) {
      callback(
        new ValidationException(
          { archivo: 'Sube un archivo .xlsx o .csv' },
          'El archivo no tiene un formato admitido',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
