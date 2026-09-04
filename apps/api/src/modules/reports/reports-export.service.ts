import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ReadStream } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import type { DatasetExport, ExportJob as ExportJobDto } from '@mes/types';
import { DATASET_EXPORT_LABEL } from '@mes/types';
import { NoEncontradoException } from '../../common/exceptions';
import {
  Alerta,
  EvaluacionCalidad,
  ExportJob,
  Merma,
  OrdenFabricacion,
  Parada,
  RegistroTiempo,
  RegistroVelocidad,
} from '../../database/entities';
import { ahoraIso, tamanoLegible } from './reports.util';
import type { ExportRequestDto } from './dto/export-request.dto';

/** Carpeta de salida de los XLSX generados. */
const DIRECTORIO_EXPORTS = resolve(process.cwd(), 'data', 'exports');

/** Content-Type con el que se sirve cada formato de exportación. */
const MIME_POR_FORMATO: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

type Fila = (string | number | boolean | null)[];

interface Hoja {
  nombre: string;
  columnas: { header: string; width: number }[];
  filas: Fila[];
}

@Injectable()
export class ReportsExportService {
  private readonly logger = new Logger(ReportsExportService.name);

  constructor(
    @InjectRepository(ExportJob) private readonly jobs: Repository<ExportJob>,
    @InjectRepository(OrdenFabricacion) private readonly ordenes: Repository<OrdenFabricacion>,
    @InjectRepository(Parada) private readonly paradas: Repository<Parada>,
    @InjectRepository(Merma) private readonly mermas: Repository<Merma>,
    @InjectRepository(RegistroVelocidad) private readonly velocidades: Repository<RegistroVelocidad>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
    @InjectRepository(RegistroTiempo) private readonly tiempos: Repository<RegistroTiempo>,
    @InjectRepository(EvaluacionCalidad) private readonly calidad: Repository<EvaluacionCalidad>,
  ) {}

  async historial(): Promise<ExportJobDto[]> {
    const filas = await this.jobs.find({ order: { solicitadoEn: 'DESC' } });
    return filas.map((f) => this.aDto(f));
  }

  async crear(dto: ExportRequestDto, solicitadoPor: string): Promise<ExportJobDto> {
    const id = await this.siguienteId();
    const nombre = `${dto.datasets.map((d) => DATASET_EXPORT_LABEL[d]).join(' y ')} · ${dto.desde} a ${dto.hasta}`;
    const job = await this.jobs.save(
      this.jobs.create({
        id,
        nombre,
        datasets: dto.datasets,
        formato: dto.formato,
        solicitadoEn: ahoraIso(),
        solicitadoPor,
        estado: 'generando',
        desde: dto.desde,
        hasta: dto.hasta,
        lineaId: dto.lineaId ?? null,
      }),
    );

    /* La generación es asíncrona: el job nace `generando` y pasa a `listo`. */
    void this.generar(job).catch((error: unknown) => {
      this.logger.error(`Fallo al generar ${id}`, error as Error);
      void this.jobs.update({ id }, { estado: 'error' });
    });

    return this.aDto(job);
  }

  async descargar(id: string): Promise<{ stream: ReadStream; nombre: string; tipo: string }> {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new NoEncontradoException('Trabajo de exportación');

    /* Los trabajos del histórico sembrado no tienen archivo en disco: se
       regenera al vuelo con los datos actuales (sólo xlsx sabe generarse). */
    if (!job.rutaArchivo || !existsSync(job.rutaArchivo)) {
      if (job.formato !== 'xlsx') throw new NoEncontradoException('Archivo de exportación');
      await this.generar(job);
      const regenerado = await this.jobs.findOne({ where: { id } });
      if (!regenerado?.rutaArchivo || !existsSync(regenerado.rutaArchivo)) {
        throw new NoEncontradoException('Archivo de exportación');
      }
      return {
        stream: createReadStream(regenerado.rutaArchivo),
        nombre: `${job.id}.xlsx`,
        tipo: MIME_POR_FORMATO.xlsx,
      };
    }

    return {
      stream: createReadStream(job.rutaArchivo),
      nombre: `${job.id}.${job.formato}`,
      tipo: MIME_POR_FORMATO[job.formato] ?? 'application/octet-stream',
    };
  }

  /** Un trabajo sólo publica `url` si su archivo se puede servir de verdad. */
  private descargable(job: ExportJob): boolean {
    if (job.estado !== 'listo') return false;
    if (job.rutaArchivo && existsSync(job.rutaArchivo)) return true;
    return job.formato === 'xlsx';
  }

  /* ---------------------------------------------------------------- */
  /* Generación del libro                                              */
  /* ---------------------------------------------------------------- */

  private async generar(job: ExportJob): Promise<void> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'MES Yamboly';
    libro.created = new Date();

    for (const dataset of job.datasets) {
      const hoja = await this.hojaDe(dataset, job);
      this.escribirHoja(libro, hoja);
    }

    mkdirSync(DIRECTORIO_EXPORTS, { recursive: true });
    const ruta = join(DIRECTORIO_EXPORTS, `${job.id}.xlsx`);
    await libro.xlsx.writeFile(ruta);

    await this.jobs.update(
      { id: job.id },
      {
        estado: 'listo',
        rutaArchivo: ruta,
        tamano: tamanoLegible(statSync(ruta).size),
        url: `/reportes/exportaciones/${job.id}/descargar`,
      },
    );
  }

  private escribirHoja(libro: ExcelJS.Workbook, hoja: Hoja): void {
    const ws = libro.addWorksheet(hoja.nombre);
    ws.columns = hoja.columnas.map((c) => ({ header: c.header, width: c.width }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: 'middle' };
    for (const fila of hoja.filas) ws.addRow(fila);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnas.length } };
  }

  private async hojaDe(dataset: DatasetExport, job: ExportJob): Promise<Hoja> {
    const rango = { desde: job.desde ?? '0000-01-01', hasta: job.hasta ?? '9999-12-31' };
    const linea = job.lineaId ?? undefined;

    switch (dataset) {
      case 'ordenes': {
        const filas = await this.ordenes.find({ where: { fecha: Between(rango.desde, rango.hasta) } });
        const datos = linea ? filas.filter((o) => o.lineaId === linea) : filas;
        return {
          nombre: 'Órdenes',
          columnas: [
            { header: 'Código', width: 18 }, { header: 'Fecha', width: 12 }, { header: 'Línea', width: 10 },
            { header: 'Producto', width: 14 }, { header: 'Turno', width: 8 }, { header: 'Lote', width: 14 },
            { header: 'Planificado', width: 13 }, { header: 'Producido', width: 12 },
            { header: 'OEE %', width: 9 }, { header: 'Paradas', width: 9 }, { header: 'Merma kg', width: 11 },
            { header: 'Estado', width: 13 },
          ],
          filas: datos.map((o) => [
            o.codigo, o.fecha, o.lineaId, o.productoId, o.turno, o.lote,
            o.planificado, o.producido, o.oee?.oee ?? 0, o.paradasCount, o.mermasKg, o.estado,
          ]),
        };
      }
      case 'paradas': {
        const filas = await this.paradas.find();
        const datos = filas
          .filter((p) => p.inicio.slice(0, 10) >= rango.desde && p.inicio.slice(0, 10) <= rango.hasta)
          .filter((p) => !linea || p.lineaId === linea);
        return {
          nombre: 'Paradas',
          columnas: [
            { header: 'Id', width: 14 }, { header: 'Orden', width: 14 }, { header: 'Línea', width: 10 },
            { header: 'Causa', width: 16 }, { header: 'Inicio', width: 20 },
            { header: 'Fin', width: 20 }, { header: 'Duración min', width: 13 },
            { header: 'Afecta OEE', width: 12 }, { header: 'Acción tomada', width: 46 },
            { header: 'TRI seg', width: 9 },
          ],
          filas: datos.map((p) => [
            p.id, p.ordenId, p.lineaId, p.causaId, p.inicio, p.fin,
            p.duracionMin, p.afectaOee, p.accionTomada, p.tiempoRegistroSeg,
          ]),
        };
      }
      case 'mermas': {
        const filas = await this.mermas.find();
        const datos = filas
          .filter((m) => m.registradaEn.slice(0, 10) >= rango.desde && m.registradaEn.slice(0, 10) <= rango.hasta)
          .filter((m) => !linea || m.lineaId === linea);
        return {
          nombre: 'Mermas',
          columnas: [
            { header: 'Id', width: 14 }, { header: 'Orden', width: 14 }, { header: 'Línea', width: 10 },
            { header: 'Tipo', width: 8 }, { header: 'Cantidad kg', width: 12 }, { header: 'Sabor', width: 14 },
            { header: 'Causa', width: 14 }, { header: 'Balde', width: 12 },
            { header: 'Pasteurización', width: 15 }, { header: 'Registrada en', width: 20 },
            { header: 'TRI seg', width: 9 },
          ],
          filas: datos.map((m) => [
            m.id, m.ordenId, m.lineaId, m.tipo, m.cantidadKg, m.sabor, m.causaId,
            m.codigoBalde ?? '', m.enviarPasteurizacion, m.registradaEn, m.tiempoRegistroSeg,
          ]),
        };
      }
      case 'velocidades': {
        const filas = await this.velocidades.find();
        const datos = linea ? filas.filter((v) => v.lineaId === linea) : filas;
        return {
          nombre: 'Velocidades',
          columnas: [
            { header: 'Id', width: 14 }, { header: 'Orden', width: 14 }, { header: 'Línea', width: 10 },
            { header: 'Velocidad real', width: 14 }, { header: 'Registrado en', width: 20 },
          ],
          filas: datos.map((v) => [
            v.id,
            v.ordenId,
            v.lineaId,
            (v as unknown as { velocidadReal?: number }).velocidadReal ?? 0,
            (v as unknown as { registradoEn?: string }).registradoEn ?? '',
          ]),
        };
      }
      case 'alertas': {
        const filas = await this.alertas.find({ order: { generadaEn: 'DESC' } });
        const datos = linea ? filas.filter((a) => a.lineaId === linea) : filas;
        return {
          nombre: 'Alertas',
          columnas: [
            { header: 'Id', width: 12 }, { header: 'Tipo', width: 18 }, { header: 'Severidad', width: 11 },
            { header: 'Línea', width: 10 }, { header: 'Predicción', width: 52 },
            { header: 'Probabilidad %', width: 14 }, { header: 'Estado', width: 12 },
            { header: 'Acierto', width: 9 }, { header: 'Generada en', width: 20 },
          ],
          filas: datos.map((a) => [
            a.id, a.tipo, a.severidad, a.lineaCodigo, a.prediccion,
            a.probabilidad, a.estado, a.acierto === null ? '' : a.acierto, a.generadaEn,
          ]),
        };
      }
      case 'indicadores': {
        const filas = await this.ordenes.find({ where: { fecha: Between(rango.desde, rango.hasta) } });
        const datos = linea ? filas.filter((o) => o.lineaId === linea) : filas;
        return {
          nombre: 'Indicadores OEE',
          columnas: [
            { header: 'Orden', width: 16 }, { header: 'Fecha', width: 12 }, { header: 'Línea', width: 10 },
            { header: 'Turno', width: 8 }, { header: 'OEE %', width: 9 }, { header: 'Disponibilidad %', width: 16 },
            { header: 'Desempeño %', width: 13 }, { header: 'Calidad %', width: 11 },
          ],
          filas: datos.map((o) => [
            o.codigo, o.fecha, o.lineaId, o.turno,
            o.oee?.oee ?? 0, o.oee?.disponibilidad ?? 0, o.oee?.desempeno ?? 0, o.oee?.calidad ?? 0,
          ]),
        };
      }
      case 'evidencia': {
        const tiempos = await this.tiempos.find({ order: { etapa: 'ASC', n: 'ASC' } });
        const calidad = await this.calidad.find({ order: { n: 'ASC' } });
        return {
          nombre: 'Evidencia TRI-TCI',
          columnas: [
            { header: 'Instrumento', width: 14 }, { header: 'N', width: 6 }, { header: 'Fecha', width: 12 },
            { header: 'Registro', width: 42 }, { header: 'Etapa / Turno', width: 14 },
            { header: 'Valor', width: 10 }, { header: 'Unidad', width: 10 },
          ],
          filas: [
            ...tiempos.map((t): Fila => [
              'Anexo 02 TRI', t.n, t.fecha, t.eventoRegistrado, t.etapa,
              Math.round((t.segundos / 60) * 10) / 10, 'min',
            ]),
            ...calidad.map((c): Fila => [
              'Anexo 03 TCI', c.n, c.fecha, c.registro, c.turno,
              c.camposObligatoriosCompletos && c.causaEspecifica && c.duracionMin > 0 ? 1 : 0, '0/1',
            ]),
          ],
        };
      }
      default:
        return { nombre: 'Sin datos', columnas: [{ header: 'Dataset', width: 20 }], filas: [[dataset]] };
    }
  }

  private async siguienteId(): Promise<string> {
    const ultimo = await this.jobs.find({ order: { id: 'DESC' }, take: 1 });
    const n = ultimo.length ? Number(ultimo[0]!.id.replace(/\D/g, '')) : 0;
    return `EXP-${String(n + 1).padStart(3, '0')}`;
  }

  private aDto(job: ExportJob): ExportJobDto {
    return {
      id: job.id,
      nombre: job.nombre,
      datasets: job.datasets,
      formato: job.formato,
      solicitadoEn: job.solicitadoEn,
      solicitadoPor: job.solicitadoPor,
      estado: job.estado,
      tamano: job.tamano ?? undefined,
      url: this.descargable(job) ? `/reportes/exportaciones/${job.id}/descargar` : undefined,
    };
  }
}
