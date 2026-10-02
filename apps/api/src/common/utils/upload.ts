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

/** Tamaño máximo de una foto de evidencia. */
export const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;

/** Extensiones aceptadas como evidencia fotográfica. */
export const EXTENSIONES_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp', '.heic'] as const;

/**
 * Mimetypes de foto. La cámara de iOS manda `image/heic` y algunos navegadores
 * de Android mandan `application/octet-stream`, así que además se comprueba la
 * extensión.
 */
const MIMETYPES_IMAGEN = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/octet-stream',
]);

/** `true` si el nombre termina en una extensión de imagen aceptada. */
export function extensionImagenAceptada(nombre: string): boolean {
  const minuscula = nombre.toLowerCase();
  return EXTENSIONES_IMAGEN.some((ext) => minuscula.endsWith(ext));
}

/**
 * Opciones de `FileInterceptor` para subir una foto de evidencia: memoria,
 * ≤ 8 MB y sólo imagen. El límite es más alto que el de las plantillas porque
 * una foto de móvil sin recomprimir ronda los 3-5 MB.
 */
export const OPCIONES_SUBIDA_IMAGEN: MulterOptions = {
  limits: { fileSize: MAX_BYTES_IMAGEN, files: 1 },
  fileFilter(_req, file, callback) {
    const aceptado = extensionImagenAceptada(file.originalname) && MIMETYPES_IMAGEN.has(file.mimetype);
    if (!aceptado) {
      callback(
        new ValidationException(
          { archivo: 'Sube una foto .jpg, .png, .webp o .heic' },
          'El archivo no es una imagen admitida',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};

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

/**
 * Comprueba la firma real del archivo (magic bytes) y que coincida con la
 * extensión: un HTML o un PDF renombrado a `.png` no pasa.
 */
export function firmaImagenValida(buffer: Buffer, nombre: string): boolean {
  if (!buffer || buffer.length < 12) return false;
  const ext = nombre.toLowerCase().slice(nombre.lastIndexOf('.'));
  const esJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const esPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const esWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const marca = buffer.subarray(8, 12).toString('ascii');
  const esHeic =
    buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(marca);
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return esJpeg;
    case '.png':
      return esPng;
    case '.webp':
      return esWebp;
    case '.heic':
      return esHeic;
    default:
      return false;
  }
}
