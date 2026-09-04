import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import type { ClaveCriterioTci, KpiTesisId } from '@mes/types';
import { ahoraIso } from '../../common/utils';
import { ExportJob } from '../../database/entities';
import { EvidenceService } from './evidence.service';
import { EvidenceValidationService } from './evidence-validation.service';
import type { ExportEvidenciaDto } from './dto/evidence.dto';

const DIRECTORIO_EXPORTS = resolve(process.cwd(), 'data', 'exports');

/** Anexo de cada instrumento; da nombre a la hoja del libro. */
const HOJA_POR_KPI: Record<KpiTesisId, string> = {
  TRI: 'Anexo 02 TRI',
  TCI: 'Anexo 03 TCI',
  TSP: 'Anexo 04 TSP',
  CFS: 'Anexo 05 CFS',
  EP: 'Anexo 06 EP',
};

type Fila = (string | number | boolean)[];

/**
 * Exporta los instrumentos de la tesis a un XLSX con una hoja por anexo.
 * Con `destino: 'spss'` los booleanos se codifican como 1/0 para la carga directa.
 */
@Injectable()
export class EvidenceExportService {
  private readonly logger = new Logger(EvidenceExportService.name);

  constructor(
    @InjectRepository(ExportJob) private readonly jobs: Repository<ExportJob>,
    private readonly evidencia: EvidenceService,
    private readonly validacion: EvidenceValidationService,
  ) {}

  async exportar(dto: ExportEvidenciaDto, solicitadoPor: string): Promise<{ id: string; estado: 'generando' }> {
    const id = await this.siguienteId();
    await this.jobs.save(
      this.jobs.create({
        id,
        nombre: `Evidencia ${dto.kpis.join(', ')} · ${dto.destino === 'spss' ? 'SPSS' : 'informe'}`,
        datasets: ['evidencia'],
        formato: dto.formato,
        solicitadoEn: ahoraIso(),
        solicitadoPor,
        estado: 'generando',
      }),
    );

    void this.generar(id, dto).catch((error: unknown) => {
      this.logger.error(`Fallo al generar ${id}`, error as Error);
      void this.jobs.update({ id }, { estado: 'error' });
    });

    return { id, estado: 'generando' };
  }

  private async generar(id: string, dto: ExportEvidenciaDto): Promise<void> {
    const spss = dto.destino === 'spss';
    const bool = (v: boolean): string | number => (spss ? (v ? 1 : 0) : v ? 'Sí' : 'No');

    const libro = new ExcelJS.Workbook();
    libro.creator = 'MES Yamboly · Evidencia de tesis';
    libro.created = new Date();

    for (const kpi of dto.kpis) {
      const ws = libro.addWorksheet(HOJA_POR_KPI[kpi]);
      const { columnas, filas } = await this.hojaDe(kpi, bool);
      ws.columns = columnas.map((c) => ({ header: c.header, width: c.width }));
      ws.getRow(1).font = { bold: true };
      for (const fila of filas) ws.addRow(fila);
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    }

    mkdirSync(DIRECTORIO_EXPORTS, { recursive: true });
    const ruta = join(DIRECTORIO_EXPORTS, `${id}.xlsx`);
    await libro.xlsx.writeFile(ruta);
    const bytes = statSync(ruta).size;

    await this.jobs.update(
      { id },
      {
        estado: 'listo',
        rutaArchivo: ruta,
        tamano: bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`,
        url: `/api/v1/reportes/exportaciones/${id}/descargar`,
      },
    );
  }

  private async hojaDe(
    kpi: KpiTesisId,
    bool: (v: boolean) => string | number,
  ): Promise<{ columnas: { header: string; width: number }[]; filas: Fila[] }> {
    switch (kpi) {
      case 'TRI': {
        const tri = await this.evidencia.tri();
        return {
          columnas: [
            { header: 'N', width: 6 }, { header: 'Etapa', width: 10 }, { header: 'Fecha', width: 12 },
            { header: 'Evento registrado', width: 44 }, { header: 'Hora inicio', width: 12 },
            { header: 'Tiempo (min)', width: 13 }, { header: 'Observación', width: 40 },
          ],
          filas: [...tri.pretest, ...tri.postest].map((r): Fila => [
            r.n, r.etapa, r.fecha, r.eventoRegistrado, r.horaInicioRegistro, r.tiempoMin, r.observacion ?? '',
          ]),
        };
      }
      case 'TCI': {
        const tci = await this.validacion.evidencia();
        return {
          columnas: [
            { header: 'N', width: 6 }, { header: 'Fecha', width: 12 }, { header: 'Turno', width: 8 },
            { header: 'Tipo', width: 11 }, { header: 'Registro', width: 16 },
            { header: 'Línea', width: 10 }, { header: 'Referencia', width: 38 },
            { header: 'Completo', width: 10 }, { header: 'Sensor', width: 10 },
            { header: 'Solicitud', width: 11 }, { header: 'SAP', width: 10 },
            { header: 'Válido', width: 9 }, { header: 'Detalle', width: 72 },
            { header: 'Observación', width: 52 },
          ],
          filas: tci.registros.map((r): Fila => {
            const por = (clave: ClaveCriterioTci): string | number => {
              const criterio = r.criterios.find((c) => c.clave === clave);
              return criterio ? bool(criterio.cumple) : '';
            };
            return [
              r.n, r.fecha, r.turno, r.tipoRegistro, r.registroId, r.lineaCodigo, r.referencia,
              por('completo'), por('sensor'), por('solicitud'), por('sap'),
              bool(r.valido),
              r.criterios.map((c) => `${c.label}: ${c.detalle}`).join(' · '),
              r.observacion ?? '',
            ];
          }),
        };
      }
      case 'TSP': {
        const tsp = await this.evidencia.tsp();
        return {
          columnas: [
            { header: 'Ítem', width: 7 }, { header: 'Enunciado', width: 76 },
            { header: 'Promedio', width: 11 }, { header: '% de acuerdo', width: 14 },
          ],
          filas: tsp.items.map((i): Fila => [i.n, i.texto, i.promedio ?? '', i.pctAcuerdo ?? '']),
        };
      }
      case 'CFS': {
        const cfs = await this.evidencia.cfs();
        return {
          columnas: [
            { header: 'N', width: 6 }, { header: 'RF', width: 7 }, { header: 'Funcionalidad', width: 34 },
            { header: 'Cumple', width: 10 }, { header: 'Observación', width: 60 }, { header: 'Ruta', width: 24 },
          ],
          filas: cfs.items.map((i): Fila => [i.n, i.rf, i.funcionalidad, bool(i.cumple), i.observacion, i.ruta]),
        };
      }
      case 'EP': {
        const ep = await this.evidencia.ep();
        return {
          columnas: [
            { header: 'N', width: 6 }, { header: 'Fecha', width: 12 },
            { header: 'Tipo de predicción', width: 34 }, { header: 'Evento real', width: 46 },
            { header: 'Acierto', width: 9 }, { header: 'Observación', width: 46 }, { header: 'Alerta', width: 14 },
          ],
          filas: ep.registros.map((r): Fila => [
            r.n, r.fecha, r.tipoPrediccion, r.eventoReal, bool(r.acierto), r.observacion, r.alertaId ?? '',
          ]),
        };
      }
    }
  }

  private async siguienteId(): Promise<string> {
    const ultimo = await this.jobs.find({ order: { id: 'DESC' }, take: 1 });
    const n = ultimo.length ? Number(ultimo[0]!.id.replace(/\D/g, '')) : 0;
    return `EXP-${String(n + 1).padStart(3, '0')}`;
  }
}
