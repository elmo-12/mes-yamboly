import { http, HttpResponse } from 'msw';
import type { Modelo, ReentrenamientoJob, VersionModelo } from '@mes/types';
import {
  analiticaResumen,
  estadoDatos,
  estadoDatosInsuficiente,
  modelo,
  patrones,
  predicciones,
} from '../data';
import { epActual, getStore, nextId } from '../store';
import { API, ahoraIso, errores, preludio } from './_utils';

/**
 * Copia mutable del modelo para la sesión: activar una versión y reentrenar
 * persisten mientras el mock esté cargado, como haría el backend real.
 */
const modeloSesion: Modelo = JSON.parse(JSON.stringify(modelo)) as Modelo;

/** Reentrenamiento en curso; la vista lo sondea hasta que la versión queda vigente. */
let reentrenamiento: ReentrenamientoJob | null = null;

function versionVigente(): VersionModelo {
  return modeloSesion.versiones.find((v) => v.estado === 'vigente') ?? modeloSesion.versiones[0]!;
}

/** `v3.2` → `v3.3`. */
function siguienteVersion(actual: string): string {
  const [mayor, menor] = actual.replace('v', '').split('.');
  return `v${mayor ?? '3'}.${Number(menor ?? 0) + 1}`;
}

export const analyticsHandlers = [
  http.get(`${API}/analitica/resumen`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const store = getStore();
    const vigente = versionVigente();
    return HttpResponse.json({
      ...analiticaResumen,
      modelo: {
        ...analiticaResumen.modelo,
        version: vigente.version,
        entrenadoEn: vigente.entrenadoEn,
        eventos: vigente.eventos,
      },
      /* EP se recalcula con las confirmaciones de la sesión. */
      kpis: { ...analiticaResumen.kpis, ep: epActual() },
      prediccionesActivas: store.alertas
        .filter((a) => a.estado === 'activa')
        .map((a) => ({
          id: a.id,
          lineaCodigo: a.lineaCodigo,
          tipo: a.tipo,
          prediccion: a.prediccion,
          probabilidad: a.probabilidad,
          ventana: `${a.ventanaInicio.slice(11, 16)}–${a.ventanaFin.slice(11, 16)}`,
          estado: 'Activa',
        })),
    });
  }),

  http.get(`${API}/analitica/patrones`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(patrones);
  }),

  http.get(`${API}/analitica/predicciones`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json(predicciones);
  }),

  http.get(`${API}/analitica/modelo`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    return HttpResponse.json({
      ...modeloSesion,
      reentrenamiento: reentrenamiento ?? undefined,
    });
  }),

  http.get(`${API}/analitica/estado-datos`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const url = new URL(request.url);
    return HttpResponse.json(
      url.searchParams.get('estado') === 'insuficiente' ? estadoDatosInsuficiente : estadoDatos,
    );
  }),

  http.post(`${API}/analitica/reentrenar`, async ({ request }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const anterior = versionVigente();
    const version = siguienteVersion(anterior.version);
    const job: ReentrenamientoJob = {
      id: nextId('JOB'),
      estado: 'entrenando',
      version,
      iniciadoEn: ahoraIso(),
      mensaje: 'Reentrenamiento encolado · CRISP-DM fases 3 a 5',
    };
    reentrenamiento = job;
    /* El entrenamiento termina poco después y la nueva versión queda vigente. */
    setTimeout(() => {
      modeloSesion.versiones = [
        {
          version,
          entrenadoEn: ahoraIso().slice(0, 10),
          eventos: anterior.eventos + 180,
          auc: Math.min(0.99, anterior.auc + 0.01),
          f1: Math.min(0.99, anterior.f1 + 0.01),
          estado: 'vigente',
        },
        ...modeloSesion.versiones.map((v) => ({ ...v, estado: 'archivada' as const })),
      ];
      reentrenamiento = { ...job, estado: 'listo', mensaje: `Modelo ${version} vigente` };
    }, 6_000);
    return HttpResponse.json(job, { status: 202 });
  }),

  http.post(`${API}/analitica/modelo/:version/activar`, async ({ request, params }) => {
    const simulado = await preludio(request);
    if (simulado) return simulado;
    const version = String(params.version);
    if (!modeloSesion.versiones.some((v) => v.version === version)) {
      return errores.noEncontrado('Versión del modelo');
    }
    modeloSesion.versiones = modeloSesion.versiones.map((v) => ({
      ...v,
      estado: v.version === version ? ('vigente' as const) : ('archivada' as const),
    }));
    return HttpResponse.json(modeloSesion);
  }),
];
