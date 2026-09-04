import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  COLUMNAS_FUENTE,
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
import { ValidationException } from '../../common/exceptions';
import { LookupsService } from '../../common/mappers';
import { ahoraIso, esXlsx, hoyIso, type ArchivoSubido } from '../../common/utils';
import {
  ImportacionFuente,
  LecturaSensor,
  SolicitudExterna,
  TransferenciaSap,
} from '../../database/entities';
import {
  aFecha,
  aNumero,
  aTexto,
  isoLocal,
  leerTabla,
  normalizarCabecera,
  type FilaTabla,
  type ValorCelda,
} from './tabla.util';

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

/**
 * Importación de las 3 fuentes externas contra las que se valida el TCI.
 * No hay integración en vivo: se descarga una plantilla, se llena y se sube.
 */
@Injectable()
export class EvidenceImportService {
  constructor(
    @InjectRepository(ImportacionFuente) private readonly importaciones: Repository<ImportacionFuente>,
    @InjectRepository(LecturaSensor) private readonly lecturas: Repository<LecturaSensor>,
    @InjectRepository(SolicitudExterna) private readonly solicitudes: Repository<SolicitudExterna>,
    @InjectRepository(TransferenciaSap) private readonly transferencias: Repository<TransferenciaSap>,
    private readonly lookups: LookupsService,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Consulta                                                          */
  /* ---------------------------------------------------------------- */

  /** Estado de las 3 fuentes: filas acumuladas, última importación y periodo. */
  async fuentes(): Promise<FuenteExternaResumen[]> {
    return Promise.all(TIPOS_FUENTE_EXTERNA.map((tipo) => this.fuente(tipo)));
  }

  async fuente(tipo: TipoFuenteExterna): Promise<FuenteExternaResumen> {
    const [filas, periodo, ultima] = await Promise.all([
      this.contarFilas(tipo),
      this.periodoAcumulado(tipo),
      this.ultimaImportacion(tipo),
    ]);
    return {
      tipo,
      label: TIPO_FUENTE_EXTERNA_LABEL[tipo],
      filas,
      ...(ultima ? { ultimaImportacion: ultima } : {}),
      ...(periodo ? { periodo } : {}),
    };
  }

  /** Historial de importaciones de una fuente, de la más reciente a la más antigua. */
  async historial(tipo: TipoFuenteExterna): Promise<ImportacionResumen[]> {
    const filas = await this.importaciones.find({ where: { tipo }, order: { importadoEn: 'DESC' } });
    return filas.map((f) => this.aResumen(f));
  }

  /** Última importación registrada de una fuente. */
  async ultimaImportacion(tipo: TipoFuenteExterna): Promise<ImportacionResumen | undefined> {
    const [fila] = await this.importaciones.find({
      where: { tipo },
      order: { importadoEn: 'DESC' },
      take: 1,
    });
    return fila ? this.aResumen(fila) : undefined;
  }

  private aResumen(f: ImportacionFuente): ImportacionResumen {
    return {
      id: f.id,
      archivo: f.archivo,
      fecha: f.importadoEn,
      usuario: f.importadoPor,
      filasOk: f.filasOk,
      filasRechazadas: f.filasRechazadas,
    };
  }

  private async contarFilas(tipo: TipoFuenteExterna): Promise<number> {
    if (tipo === 'sensores') return this.lecturas.count();
    if (tipo === 'solicitudes') return this.solicitudes.count();
    return this.transferencias.count();
  }

  private async periodoAcumulado(
    tipo: TipoFuenteExterna,
  ): Promise<{ desde: string; hasta: string } | null> {
    const fechas =
      tipo === 'sensores'
        ? (await this.lecturas.find({ select: { fechaHora: true } })).map((l) => l.fechaHora.slice(0, 10))
        : tipo === 'solicitudes'
          ? (await this.solicitudes.find({ select: { fecha: true } })).map((s) => s.fecha.slice(0, 10))
          : (await this.transferencias.find({ select: { fecha: true } })).map((t) => t.fecha.slice(0, 10));
    if (fechas.length === 0) return null;
    fechas.sort();
    return { desde: fechas[0]!, hasta: fechas[fechas.length - 1]! };
  }

  /* ---------------------------------------------------------------- */
  /* Plantillas descargables                                           */
  /* ---------------------------------------------------------------- */

  /** XLSX con la cabecera exacta, 3 filas de ejemplo y una hoja «Instrucciones». */
  async plantilla(tipo: TipoFuenteExterna): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'MES Yamboly · Evidencia de tesis';
    libro.created = new Date();

    const columnas = COLUMNAS_FUENTE[tipo];
    const hoja = libro.addWorksheet(HOJA[tipo]);
    hoja.columns = columnas.map((c) => ({ header: c, key: c, width: ANCHOS[c] ?? 18 }));
    hoja.getRow(1).font = { bold: true };
    for (const fila of ejemplos(tipo, hoyIso())) hoja.addRow(fila);
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

    const guia = libro.addWorksheet('Instrucciones');
    guia.columns = [{ width: 22 }, { width: 96 }];
    for (const fila of instrucciones(tipo)) guia.addRow(fila);
    guia.getRow(1).font = { bold: true };

    const bytes = await libro.xlsx.writeBuffer();
    return Buffer.from(bytes);
  }

  /* ---------------------------------------------------------------- */
  /* Importación                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Lee el archivo, valida fila a fila y acumula las filas nuevas.
   * Los duplicados (misma clave natural) se ignoran; las filas con problemas se
   * devuelven en `rechazos` con el motivo y el número de fila del archivo.
   */
  async importar(
    tipo: TipoFuenteExterna,
    archivo: ArchivoSubido,
    mapeo: Record<string, string>,
    usuario: string,
  ): Promise<ImportacionResultado> {
    const tabla = await leerTabla(archivo.buffer, esXlsx(archivo.originalname));
    if (tabla.filas.length === 0) {
      throw new ValidationException(
        { archivo: 'El archivo no tiene filas de datos bajo la cabecera' },
        'No se encontró ninguna fila para importar',
      );
    }

    const id = await this.siguienteId(tipo);
    const rechazos: RechazoFila[] = [];
    const fechas: string[] = [];
    let duplicadas = 0;

    const contexto = await this.contexto();
    const vistos = new Set<string>();
    const nuevos: (LecturaSensor | SolicitudExterna | TransferenciaSap)[] = [];

    for (const { numero, valores } of tabla.filas) {
      const leido = this.leerFila(tipo, valores, mapeo, contexto, id);
      if ('motivo' in leido) {
        rechazos.push({ fila: numero, motivo: leido.motivo });
        continue;
      }
      if (vistos.has(leido.clave) || contexto.clavesExistentes.has(leido.clave)) {
        duplicadas += 1;
        continue;
      }
      vistos.add(leido.clave);
      nuevos.push(leido.entidad);
      fechas.push(leido.fecha);
    }

    await this.guardar(tipo, nuevos);
    fechas.sort();
    const periodo = fechas.length ? { desde: fechas[0]!, hasta: fechas[fechas.length - 1]! } : undefined;

    await this.importaciones.save(
      this.importaciones.create({
        id,
        tipo,
        archivo: archivo.originalname,
        importadoEn: ahoraIso(),
        importadoPor: usuario,
        filasOk: nuevos.length,
        filasRechazadas: rechazos.length,
        filasDuplicadas: duplicadas,
        desde: periodo?.desde ?? null,
        hasta: periodo?.hasta ?? null,
      }),
    );

    return {
      id,
      tipo,
      archivo: archivo.originalname,
      filasOk: nuevos.length,
      filasRechazadas: rechazos.length,
      filasDuplicadas: duplicadas,
      rechazos,
      ...(periodo ? { periodo } : {}),
    };
  }

  private async guardar(
    tipo: TipoFuenteExterna,
    filas: (LecturaSensor | SolicitudExterna | TransferenciaSap)[],
  ): Promise<void> {
    if (filas.length === 0) return;
    if (tipo === 'sensores') {
      await this.lecturas.save(filas as LecturaSensor[], { chunk: 200 });
    } else if (tipo === 'solicitudes') {
      await this.solicitudes.save(filas as SolicitudExterna[], { chunk: 200 });
    } else {
      await this.transferencias.save(filas as TransferenciaSap[], { chunk: 200 });
    }
  }

  private async siguienteId(tipo: TipoFuenteExterna): Promise<string> {
    const total = await this.importaciones.countBy({ tipo });
    return `${PREFIJO[tipo]}-${String(total + 1).padStart(3, '0')}`;
  }

  /* ---------------------------------------------------------------- */
  /* Lectura de una fila                                               */
  /* ---------------------------------------------------------------- */

  private async contexto(): Promise<ContextoImportacion> {
    const lookups = await this.lookups.load();
    const lineasPorCodigo = new Map<string, string>();
    for (const linea of lookups.lineas.values()) {
      lineasPorCodigo.set(linea.codigo.toUpperCase(), linea.id);
    }
    const productos = new Set<string>();
    for (const producto of lookups.productos.values()) productos.add(producto.codigo);

    const clavesExistentes = new Set<string>();
    for (const l of await this.lecturas.find({ select: { lineaId: true, fechaHora: true } })) {
      clavesExistentes.add(`${l.lineaId}|${l.fechaHora}`);
    }
    for (const s of await this.solicitudes.find({ select: { numero: true } })) {
      clavesExistentes.add(`SOL|${s.numero.toUpperCase()}`);
    }
    for (const t of await this.transferencias.find({ select: { documento: true } })) {
      clavesExistentes.add(`SAP|${t.documento.toUpperCase()}`);
    }
    return { lineasPorCodigo, productos, clavesExistentes };
  }

  /** Resuelve el valor de una columna esperada, respetando el `mapeo` manual. */
  private celda(fila: FilaTabla, columna: string, mapeo: Record<string, string>): ValorCelda {
    const alias = mapeo[columna];
    if (alias) {
      const clave = normalizarCabecera(alias);
      if (clave in fila) return fila[clave] ?? null;
    }
    return fila[columna] ?? null;
  }

  private leerFila(
    tipo: TipoFuenteExterna,
    fila: FilaTabla,
    mapeo: Record<string, string>,
    ctx: ContextoImportacion,
    importacionId: string,
  ): FilaLeida | { motivo: string } {
    const v = (columna: string): ValorCelda => this.celda(fila, columna, mapeo);
    if (tipo === 'sensores') return this.leerSensor(v, ctx, importacionId);
    if (tipo === 'solicitudes') return this.leerSolicitud(v, ctx, importacionId);
    return this.leerTransferencia(v, ctx, importacionId);
  }

  private leerSensor(
    v: (c: string) => ValorCelda,
    ctx: ContextoImportacion,
    importacionId: string,
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
    const entidad = this.lecturas.create({
      id: `SEN-${lineaId}-${fechaHora}`,
      importacionId,
      lineaId,
      fechaHora,
      estado,
      velocidadUnidMin: velocidad,
    });
    return { entidad, clave: `${lineaId}|${fechaHora}`, fecha: fechaHora.slice(0, 10) };
  }

  private leerSolicitud(
    v: (c: string) => ValorCelda,
    ctx: ContextoImportacion,
    importacionId: string,
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
    const entidad = this.solicitudes.create({
      id: `SOL-${numero.toUpperCase()}`,
      importacionId,
      numero,
      fecha: fechaIso,
      lineaId,
      tipo: tipoBruto,
      estado: estadoBruto,
      descripcion: aTexto(v('descripcion')) ?? '',
    });
    return { entidad, clave: `SOL|${numero.toUpperCase()}`, fecha: fechaIso };
  }

  private leerTransferencia(
    v: (c: string) => ValorCelda,
    ctx: ContextoImportacion,
    importacionId: string,
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
    const entidad = this.transferencias.create({
      id: `SAP-${documento.toUpperCase()}`,
      importacionId,
      documento,
      fecha: fechaIso,
      lineaId,
      productoCodigo,
      cantidadKg,
      tipoMerma: (tipoMermaBruto as TipoMermaCodigo | null) ?? null,
      motivo: aTexto(v('motivo')) ?? '',
    });
    return { entidad, clave: `SAP|${documento.toUpperCase()}`, fecha: fechaIso };
  }
}

interface ContextoImportacion {
  /** Código de línea en mayúsculas → id. */
  lineasPorCodigo: Map<string, string>;
  /** Códigos de producto de 7 dígitos del maestro. */
  productos: Set<string>;
  /** Claves naturales ya presentes en la base (deduplicación). */
  clavesExistentes: Set<string>;
}

interface FilaLeida {
  entidad: LecturaSensor | SolicitudExterna | TransferenciaSap;
  /** Clave natural para deduplicar. */
  clave: string;
  /** `YYYY-MM-DD` de la fila, para el periodo cubierto. */
  fecha: string;
}

/** Texto de la celda tal como venía, para el motivo del rechazo. */
function textoBruto(valor: ValorCelda): string {
  if (valor === null) return '';
  if (valor instanceof Date) return isoLocal(valor);
  return String(valor);
}
