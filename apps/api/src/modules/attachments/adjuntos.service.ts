/**
 * Almacén de fotos de evidencia de las capturas de planta.
 *
 * Las causas de parada y de merma pueden exigir una foto (`requiereEvidencia`).
 * Hasta ahora el asistente la pedía y la validaba en el navegador, pero el
 * archivo no salía de ahí: sólo viajaba su nombre. Este servicio la guarda de
 * verdad en `apps/api/data/evidencias/` y devuelve la URL con la que la orden
 * la referencia (`parada.evidenciaUrl`, `merma.evidenciaUrl`).
 *
 * Se guarda en disco y no en la base porque una foto de móvil ronda los megas:
 * en una columna `bytea` inflaría cada copia de seguridad y cada consulta que
 * haga `SELECT *`. La carpeta está en `.gitignore`, como la de exportaciones.
 */
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { ReadStream } from 'node:fs';
import { NoEncontradoException, ValidationException } from '../../common/exceptions';
import { type ArchivoSubido } from '../../common/utils';

/** Carpeta de salida de las fotos de evidencia. */
const DIRECTORIO = resolve(process.cwd(), 'data', 'evidencias');

/** Prefijo de la ruta pública; el cliente la guarda tal cual en la entidad. */
const RUTA_PUBLICA = '/api/v1/evidencias';

const MIME_POR_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

export interface EvidenciaGuardada {
  /** Nombre con el que quedó en disco: `EV-20260911-a1b2c3d4.jpg`. */
  nombre: string;
  /** Ruta que se guarda en `evidenciaUrl` y sirve para descargarla. */
  url: string;
  /** Nombre original en el equipo de quien la subió, para mostrarlo en la UI. */
  nombreOriginal: string;
  bytes: number;
}

@Injectable()
export class AdjuntosService {
  /** Guarda la foto y devuelve su URL. El nombre en disco nunca lo elige el cliente. */
  guardar(archivo: ArchivoSubido | undefined): EvidenciaGuardada {
    if (!archivo?.buffer?.length) {
      throw new ValidationException({ archivo: 'Adjunta una foto' }, 'No llegó ningún archivo');
    }
    const extension = extname(archivo.originalname).toLowerCase() || '.jpg';
    const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nombre = `EV-${hoy}-${randomBytes(4).toString('hex')}${extension}`;

    mkdirSync(DIRECTORIO, { recursive: true });
    writeFileSync(join(DIRECTORIO, nombre), archivo.buffer);

    return {
      nombre,
      url: `${RUTA_PUBLICA}/${nombre}`,
      nombreOriginal: archivo.originalname,
      bytes: archivo.size,
    };
  }

  /**
   * Abre una foto por su nombre. `basename` corta cualquier intento de salir de
   * la carpeta con `../`: el parámetro llega de la URL y no es de fiar.
   */
  abrir(solicitado: string): { stream: ReadStream; nombre: string; tipo: string; bytes: number } {
    const nombre = basename(solicitado);
    const ruta = join(DIRECTORIO, nombre);
    if (!existsSync(ruta)) throw new NoEncontradoException('Foto de evidencia');
    return {
      stream: createReadStream(ruta),
      nombre,
      tipo: MIME_POR_EXTENSION[extname(nombre).toLowerCase()] ?? 'application/octet-stream',
      bytes: statSync(ruta).size,
    };
  }

  /** `true` si la URL apunta a una foto que sigue en disco. */
  existe(url: string | null | undefined): boolean {
    if (!url?.startsWith(`${RUTA_PUBLICA}/`)) return false;
    return existsSync(join(DIRECTORIO, basename(url)));
  }
}
