import { http, HttpResponse } from 'msw';
import * as XLSX from 'xlsx';
import type {
  DatasetExport,
  ExportJob,
  IndicadoresResumen,
  KpiValor,
  MermasResumen,
  ParadasResumen,
  Periodo,
} from '@mes/types';
import { DATASETS_EXPORT, DATASET_EXPORT_LABEL, FORMATOS_EXPORT, esFechaCalendario } from '@mes/types';
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
import { API, ahoraIso, errores, listaQuery, preludio } from './_utils';
import { usuarioDesdeToken } from './auth';

function rango(url: URL): { periodo: Periodo; desde: string; hasta: string } {
  const periodo = (url.searchParams.get('periodo') as Periodo | null) ?? 'semana';
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  if (desde && hasta) return { periodo: 'personalizado', desde, hasta };
  const r = rangoPeriodo(periodo, HOY);
  return { periodo, ...r };
}

/**
 * `true` si la ventana (periodo, líneas y turnos) no tiene ninguna orden en el
 * store. La API marca entonces cada KPI con `sinDatos` (valor 0 sin delta) para
 * que la UI muestre «Sin datos» en vez de un 0 % que parezca una medición.
 */
function ventanaSinDatos(url: URL): boolean {
  const { desde, hasta } = rango(url);
  const lineaIds = listaQuery(url, 'lineaId');
  const turnos = listaQuery(url, 'turno');
  return !getStore().ordenes.some(
    (o) =>
      o.fecha >= desde &&
      o.fecha <= hasta &&
      (lineaIds.length === 0 || lineaIds.includes(o.lineaId)) &&
      (turnos.length === 0 || turnos.includes(o.turno))
  );
}

/** KPI de una ventana vacía: valor 0, sin delta y con `sinDatos`. */
function kpisSinDatos(kpis: readonly KpiValor[]): KpiValor[] {
  return kpis.map(({ delta: _delta, ...k }) => ({ ...k, valor: 0, sinDatos: true }));
}

export const reportsHandlers = [
  http.get(`${API}/reportes/indicadores`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    const lineaIds = listaQuery(url, 'lineaId');
    if (ventanaSinDatos(url)) {
      const vacio: IndicadoresResumen = {
        ...rango(url),
        kpis: kpisSinDatos(indicadoresKpis),
        tendenciaOee: [],
        oeePorLinea: [],
        comparativaTurno: [],
      };
      return HttpResponse.json(vacio);
    }
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
    /* `clasificacion` (programada/imprevista) no se replica: los datos de reportes son fijos. */
    if (ventanaSinDatos(url)) {
      const vacio: ParadasResumen = {
        ...rango(url),
        kpis: kpisSinDatos(paradasKpis),
        pareto: [],
        donut: [],
        detallePorCausa: [],
      };
      return HttpResponse.json(vacio);
    }
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
    if (ventanaSinDatos(url)) {
      const vacio: MermasResumen = {
        ...rango(url),
        kpis: kpisSinDatos(mermasKpis),
        apiladasPorLinea: [],
        heatmap: [],
        tabla: [],
      };
      return HttpResponse.json(vacio);
    }
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
    /* Espejo de `exportRequestSchema` / `ExportRequestDto` (422 por campo). */
    const detalles: Record<string, string> = {};
    const lista = Array.isArray(body.datasets) ? (body.datasets as string[]) : [];
    if (lista.length === 0) detalles.datasets = 'Selecciona al menos un dataset';
    else if (lista.some((d) => !DATASETS_EXPORT.includes(d as DatasetExport))) {
      detalles.datasets = 'Conjunto de datos desconocido';
    } else if (new Set(lista).size !== lista.length) detalles.datasets = 'Hay conjuntos repetidos';
    if (body.formato !== undefined && !FORMATOS_EXPORT.includes(body.formato as ExportJob['formato'])) {
      detalles.formato = 'Formato no soportado';
    }
    const desde = typeof body.desde === 'string' ? body.desde : '';
    const hasta = typeof body.hasta === 'string' ? body.hasta : '';
    if (!esFechaCalendario(desde)) detalles.desde = 'Fecha inválida';
    if (!esFechaCalendario(hasta)) detalles.hasta = 'Fecha inválida';
    else if (!detalles.desde && desde > hasta) {
      detalles.hasta = 'La fecha final debe ser igual o posterior a la inicial';
    }
    if (Object.keys(detalles).length > 0) return errores.validacion(detalles);
    const datasets = lista as ExportJob['datasets'];
    const formato = (body.formato as ExportJob['formato'] | undefined) ?? 'xlsx';
    const job: ExportJob = {
      id: nextId('EXP'),
      nombre: `${datasets.map((d) => DATASET_EXPORT_LABEL[d]).join(', ')} · ${String(body.desde ?? '')} a ${String(body.hasta ?? '')}`,
      datasets,
      formato,
      solicitadoEn: ahoraIso(),
      solicitadoPor: usuarioDesdeToken(request)?.nombre ?? 'Carlos Mendoza',
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
