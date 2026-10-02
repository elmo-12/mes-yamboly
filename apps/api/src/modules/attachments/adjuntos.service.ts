/**
 * Almacén de fotos de evidencia de las capturas de planta.
 *
 * Las causas de parada y de merma pueden exigir una foto (`requiereEvidencia`).
 * El asistente la sube en cuanto se elige (`POST /evidencias`) y la parada o la
 * merma guardan la URL que devuelve este servicio (`evidenciaUrl`).
 *
 * Se guarda en disco y no en la base porque una foto de móvil ronda los megas:
 * en una columna `bytea` inflaría cada copia de seguridad y cada consulta que
 * haga `SELECT *`. La carpeta está en `.gitignore`, como la de exportaciones.
 *
 * Junto a cada foto se escribe `<nombre>.json` con quién la subió y cuándo:
 * una URL de evidencia solo vale si apunta a una subida **reciente del mismo
 * usuario** y no la usa ya otro registro (antes bastaba con copiar la ruta de
 * una foto ajena o anteponerle `../`).
 */
import { randomBytes } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ReadStream } from 'node:fs';
import { Not, Repository } from 'typeorm';
import { NoEncontradoException, ValidationException } from '../../common/exceptions';
import { firmaImagenValida, type ArchivoSubido } from '../../common/utils';
import { Merma, Parada } from '../../database/entities';

/** Carpeta de salida de las fotos de evidencia. */
const DIRECTORIO = resolve(process.cwd(), 'data', 'evidencias');

/** Prefijo de la ruta pública; el cliente la guarda tal cual en la entidad. */
const RUTA_PUBLICA = '/api/v1/evidencias';

/** Nombre en disco que genera `guardar`; cualquier otra cosa se rechaza. */
const NOMBRE_VALIDO = /^EV-\d{8}-[0-9a-f]{8}\.(jpg|jpeg|png|webp|heic)$/;

/** Una foto subida hace más de esto ya no se puede vincular a un registro nuevo. */
export const VIGENCIA_SUBIDA_HORAS = 24;

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

interface MetadatosSubida {
  usuarioId: string;
  subidaEn: number;
}

/** Registro que quiere vincular la foto (para excluirse a sí mismo al editar). */
export interface UsoEvidencia {
  usuarioId: string;
  paradaId?: string;
  mermaId?: string;
}

@Injectable()
export class AdjuntosService {
  constructor(
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
  ) {}

  /** Guarda la foto y devuelve su URL. El nombre en disco nunca lo elige el cliente. */
  guardar(archivo: ArchivoSubido | undefined, usuarioId: string): EvidenciaGuardada {
    if (!archivo?.buffer?.length) {
      throw new ValidationException({ archivo: 'Adjunta una foto' }, 'No llegó ningún archivo');
    }
    if (!firmaImagenValida(archivo.buffer, archivo.originalname)) {
      throw new ValidationException(
        { archivo: 'El contenido no corresponde a una foto .jpg, .png, .webp o .heic' },
        'El archivo no es una imagen admitida',
      );
    }
    const extension = extname(archivo.originalname).toLowerCase() || '.jpg';
    const hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nombre = `EV-${hoy}-${randomBytes(4).toString('hex')}${extension}`;

    mkdirSync(DIRECTORIO, { recursive: true });
    writeFileSync(join(DIRECTORIO, nombre), archivo.buffer);
    const meta: MetadatosSubida = { usuarioId, subidaEn: Date.now() };
    writeFileSync(join(DIRECTORIO, `${nombre}.json`), JSON.stringify(meta));

    return {
      nombre,
      url: `${RUTA_PUBLICA}/${nombre}`,
      nombreOriginal: archivo.originalname.slice(0, 120),
      bytes: archivo.size,
    };
  }

  /**
   * Abre una foto por su nombre. Solo se sirven nombres generados por
   * `guardar` (nunca `../`, ni el `.json` de metadatos).
   */
  abrir(solicitado: string): { stream: ReadStream; nombre: string; tipo: string; bytes: number } {
    if (!NOMBRE_VALIDO.test(solicitado)) throw new NoEncontradoException('Foto de evidencia');
    const ruta = join(DIRECTORIO, solicitado);
    if (!existsSync(ruta)) throw new NoEncontradoException('Foto de evidencia');
    return {
      stream: createReadStream(ruta),
      nombre: solicitado,
      tipo: MIME_POR_EXTENSION[extname(solicitado).toLowerCase()] ?? 'application/octet-stream',
      bytes: statSync(ruta).size,
    };
  }

  /** `true` si la URL apunta a una foto que sigue en disco (sin `../`). */
  existe(url: string | null | undefined): boolean {
    const nombre = this.nombreDeUrl(url);
    return nombre !== null && existsSync(join(DIRECTORIO, nombre));
  }

  /**
   * Valida que `url` pueda vincularse al registro: ruta canónica, archivo en
   * disco, subida por el mismo usuario hace menos de {@link VIGENCIA_SUBIDA_HORAS}
   * horas y no usada ya por otra parada o merma. Lanza 422 `evidenciaUrl`.
   */
  async validarVinculo(url: string, uso: UsoEvidencia): Promise<void> {
    const error = (mensaje: string) => new ValidationException({ evidenciaUrl: mensaje });
    const nombre = this.nombreDeUrl(url);
    if (!nombre || !existsSync(join(DIRECTORIO, nombre))) {
      throw error('La foto de evidencia no existe: vuelve a adjuntarla');
    }
    const meta = this.metadatos(nombre);
    if (!meta || meta.usuarioId !== uso.usuarioId) {
      throw error('La foto de evidencia debe haberla subido el mismo usuario que registra');
    }
    if (Date.now() - meta.subidaEn > VIGENCIA_SUBIDA_HORAS * 3_600_000) {
      throw error('La foto de evidencia caducó: vuelve a adjuntarla');
    }
    const [enParadas, enMermas] = await Promise.all([
      this.paradas.count({
        where: { evidenciaUrl: url, ...(uso.paradaId ? { id: Not(uso.paradaId) } : {}) },
      }),
      this.mermas.count({
        where: { evidenciaUrl: url, ...(uso.mermaId ? { id: Not(uso.mermaId) } : {}) },
      }),
    ]);
    if (enParadas + enMermas > 0) {
      throw error('Esta foto ya está vinculada a otro registro: adjunta una nueva');
    }
  }

  private nombreDeUrl(url: string | null | undefined): string | null {
    if (!url?.startsWith(`${RUTA_PUBLICA}/`)) return null;
    const nombre = url.slice(RUTA_PUBLICA.length + 1);
    return NOMBRE_VALIDO.test(nombre) ? nombre : null;
  }

  private metadatos(nombre: string): MetadatosSubida | null {
    try {
      const meta = JSON.parse(readFileSync(join(DIRECTORIO, `${nombre}.json`), 'utf8')) as MetadatosSubida;
      return typeof meta.usuarioId === 'string' && typeof meta.subidaEn === 'number' ? meta : null;
    } catch {
      return null;
    }
  }
}
