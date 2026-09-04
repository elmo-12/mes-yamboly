import { http, HttpResponse } from 'msw';
import * as XLSX from 'xlsx';
import type {
  ExportJob,
  IndicadoresResumen,
  MermasResumen,
  ParadasResumen,
  Periodo,
} from '@mes/types';
import { DATASET_EXPORT_LABEL } from '@mes/types';
import { rangoPeriodo } from '@mes/shared';
import {
  HOY,
  comparativaTurno,
  detallePorCausaMerma,
  detallePorCausaParada,
  donutParadas,
  indicadoresKpis,
  mermasApiladasPorLinea,
  mermasHeatmap,
  mermasKpis,
  oeePorLinea,
  paradasKpis,
  paretoParadas,
  tendenciaOee,
} from '../data';
import { getStore, nextId } from '../store';
import { API, ahoraIso, listaQuery, preludio } from './_utils';

function rango(url: URL): { periodo: Periodo; desde: string; hasta: string } {
  const periodo = (url.searchParams.get('periodo') as Periodo | null) ?? 'semana';
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  if (desde && hasta) return { periodo: 'personalizado', desde, hasta };
  const r = rangoPeriodo(periodo, HOY);
  return { periodo, ...r };
}

export const reportsHandlers = [
  http.get(`${API}/reportes/indicadores`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaIds = listaQuery(url, 'lineaId');
    const data: IndicadoresResumen = {
      ...rango(url),
      kpis: indicadoresKpis,
      tendenciaOee,
      oeePorLinea: lineaIds.length > 0 ? oeePorLinea.filter((l) => lineaIds.includes(l.lineaId)) : oeePorLinea,
      comparativaTurno,
    };
    return HttpResponse.json(data);
  }),

  http.get(`${API}/reportes/paradas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const data: ParadasResumen = {
      ...rango(url),
      kpis: paradasKpis,
      pareto: paretoParadas,
      donut: donutParadas,
      detallePorCausa: detallePorCausaParada,
    };
    return HttpResponse.json(data);
  }),

  http.get(`${API}/reportes/mermas`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaIds = listaQuery(url, 'lineaId');
    const data: MermasResumen = {
      ...rango(url),
      kpis: mermasKpis,
      apiladasPorLinea:
        lineaIds.length > 0
          ? mermasApiladasPorLinea.filter((l) => lineaIds.includes(l.lineaId))
          : mermasApiladasPorLinea,
      heatmap: mermasHeatmap,
      tabla: detallePorCausaMerma,
    };
    return HttpResponse.json(data);
  }),

  http.get(`${API}/reportes/exportaciones`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({ data: getStore().exportaciones });
  }),

  http.post(`${API}/reportes/exportar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const body = (await request.json()) as Record<string, unknown>;
    const datasets = (body.datasets as ExportJob['datasets'] | undefined) ?? ['ordenes'];
    const formato = (body.formato as ExportJob['formato'] | undefined) ?? 'xlsx';
    const job: ExportJob = {
      id: nextId('EXP'),
      nombre: `${datasets.map((d) => DATASET_EXPORT_LABEL[d]).join(', ')} · ${String(body.desde ?? '')} a ${String(body.hasta ?? '')}`,
      datasets,
      formato,
      solicitadoEn: ahoraIso(),
      solicitadoPor: 'Carlos Mendoza',
      estado: 'generando',
    };
    getStore().exportaciones.unshift(job);
    /* El archivo queda listo poco después, como en el backend real. */
    setTimeout(() => {
      job.estado = 'listo';
      job.tamano = '1,8 MB';
      job.url = `/mock/exports/${job.id}.${formato}`;
    }, 2500);
    return HttpResponse.json(job, { status: 202 });
  }),

  /* Paridad con `ReportsExportService.descargar`: sirve el mismo trabajo que
     crean tanto `POST /reportes/exportar` como `POST /evidencia/exportar`
     (ambos escriben en `getStore().exportaciones`). Genera un XLSX mínimo
     con una hoja por dataset/anexo en vez de reproducir el archivo real. */
  http.get(`${API}/reportes/exportaciones/:id/descargar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const job = getStore().exportaciones.find((j) => j.id === params.id);
    if (!job) {
      return HttpResponse.json({ message: `No se encontró el trabajo de exportación «${String(params.id)}»` }, { status: 404 });
    }
    const libro = XLSX.utils.book_new();
    for (const dataset of job.datasets.length > 0 ? job.datasets : ['evidencia' as const]) {
      const hoja = XLSX.utils.aoa_to_sheet([
        [DATASET_EXPORT_LABEL[dataset] ?? dataset],
        ['Archivo', job.nombre],
        ['Solicitado por', job.solicitadoPor],
        ['Solicitado en', job.solicitadoEn],
      ]);
      XLSX.utils.book_append_sheet(libro, hoja, (DATASET_EXPORT_LABEL[dataset] ?? dataset).slice(0, 31));
    }
    const buffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return new HttpResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${job.id}.xlsx"`,
      },
    });
  }),
];
