import { ahoraIso } from '../../../common/utils';
import { ConflictoException } from '../../../common/exceptions';
import type { EntrenamientoEjecucion, ModeloVersion, PerfilDatos } from '../../../database/entities';
import type { DefinicionFeature, MuestraCalculada } from '../dataset';
import { EntrenamientoContinuoService } from './entrenamiento-continuo.service';
import { MIN_MUESTRAS, OBJETIVO_PERSISTIDO } from './entrenamiento-continuo.constants';
import {
  PythonEntrenamientoError,
  type EntrenarRequest,
  type EntrenarResponse,
  type ResultadoClasificacionPy,
  type SaludPy,
} from './python-entrenamiento.client';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function fechaEn(offsetDias: number): string {
  const base = new Date('2026-01-01T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + offsetDias);
  return base.toISOString().slice(0, 10);
}

/** 35 días × 7 muestras/día = 245 filas `anticipado`, por encima de `MIN_MUESTRAS` (200). */
function fabricarMuestras(dias = 35, porDia = 7): MuestraCalculada[] {
  const filas: MuestraCalculada[] = [];
  for (let d = 0; d < dias; d += 1) {
    const fecha = fechaEn(d);
    for (let i = 0; i < porDia; i += 1) {
      const turno = i % 2 === 0 ? 'D' : 'N';
      const positivo = (d * porDia + i) % 3 === 0 ? 1 : 0;
      filas.push({
        lineaId: `LIN-${i % 3}`,
        lineaCodigo: `LIN-${i % 3}`,
        fecha,
        turno,
        modo: 'anticipado',
        inicioTurno: `${fecha}T${turno === 'D' ? '06' : '18'}:00:00`,
        features: { paradasImprev7d: positivo ? 2 : 0 },
        huboParadaImprevista: positivo,
        mermaSobreEstandar: 0,
        minutosImprevistos: positivo ? 25 : 0,
        tipoCausaDominante: positivo ? 'PN-02' : null,
        ordenes: 1,
      });
    }
  }
  return filas;
}

function fabricarCatalogo(): DefinicionFeature[] {
  return [{ nombre: 'paradasImprev7d', grupo: 'historico7d', disponibilidad: 'anticipada', etiqueta: 'Paradas imprevistas 7 d' }];
}

function fabricarPerfil(muestras: number): PerfilDatos {
  return {
    ordenes: 500,
    paradas: 120,
    mermas: 40,
    lineas: 3,
    desde: fechaEn(0),
    hasta: fechaEn(34),
    muestras,
    tasaPositivos: 0.33,
    reglaTarget: 'parada_individual',
    umbralMinutos: 10,
    pctParadasSinCategorizar: 5,
    tiposCausa: ['PN-02'],
    columnasConNulos: {},
  };
}

const WALK_FORWARD_CANDIDATO_GANA = {
  aucRoc: 0.75,
  prAuc: 0.68,
  f1: 0.58,
  precision: 0.51,
  recall: 0.65,
  brier: 0.18,
  vp: 40,
  fp: 30,
  vn: 100,
  fn: 20,
  umbral: 0.37,
};

const WALK_FORWARD_INCUMBENTE = {
  aucRoc: 0.7,
  prAuc: 0.61,
  f1: 0.5,
  precision: 0.45,
  recall: 0.6,
  brier: 0.19,
  vp: 30,
  fp: 25,
  vn: 90,
  fn: 25,
  umbral: 0.4,
};

/** Construye un resultado que **ecoa** los pliegues de la petición: por defecto, la verificación pasa. */
function construirResultado(cuerpo: EntrenarRequest, overrides: Partial<ResultadoClasificacionPy> = {}): ResultadoClasificacionPy {
  return {
    algoritmo: 'LightGBM 4.5',
    hiperparametros: {},
    muestras: cuerpo.muestras.length,
    features: cuerpo.catalogo.length,
    tasaPositivos: 0.33,
    walkForward: WALK_FORWARD_CANDIDATO_GANA,
    aucPrueba: 0.73,
    aucRetro: 0.88,
    liftTop3: 1.6,
    corteEntrenamiento: cuerpo.evaluacion.pruebaDesde,
    cortePrueba: cuerpo.snapshot.hasta,
    pliegues: cuerpo.evaluacion.pliegues,
    importancias: [{ nombre: 'paradasImprev7d', importancia: 100 }],
    fuera: [],
    alternativas: [],
    campeonReevaluado: { version: 'v2.1', walkForward: WALK_FORWARD_INCUMBENTE },
    artefacto: { uri: `modelos/parada_imprevista/${cuerpo.version}.joblib`, sha256: 'sha-candidato', bytes: 1000 },
    ...overrides,
  };
}

const SALUD_OK: SaludPy = { estado: 'ok', modeloCargado: true, version: 'v2.1', sklearn: '1.5', uptimeS: 100 };

/* ------------------------------------------------------------------ */
/* Repos falsos en memoria                                             */
/* ------------------------------------------------------------------ */

function coincide(fila: unknown, where: Record<string, unknown>): boolean {
  const registro = fila as Record<string, unknown>;
  return Object.entries(where).every(([k, v]) => registro[k] === v);
}

interface RepoFake<T> {
  filas: T[];
  create: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
}

function crearRepoFake<T>(pk: keyof T, semilla: T[] = []): RepoFake<T> {
  const filas: T[] = [...semilla];
  return {
    filas,
    create: jest.fn((data: Partial<T>) => ({ ...data }) as T),
    find: jest.fn(async (opciones?: { where?: Record<string, unknown> }) =>
      opciones?.where ? filas.filter((f) => coincide(f, opciones.where!)) : [...filas],
    ),
    findOne: jest.fn(async (opciones?: { where?: Record<string, unknown> }) => {
      if (!opciones?.where) return filas[0] ?? null;
      return filas.find((f) => coincide(f, opciones.where!)) ?? null;
    }),
    save: jest.fn(async (entidad: T | T[]) => {
      const lista = Array.isArray(entidad) ? entidad : [entidad];
      for (const e of lista) {
        const i = filas.findIndex((f) => f[pk] === e[pk]);
        if (i >= 0) filas[i] = e;
        else filas.push(e);
      }
      return entidad;
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Arnés                                                                */
/* ------------------------------------------------------------------ */

interface Arnes {
  servicio: EntrenamientoContinuoService;
  versiones: RepoFake<ModeloVersion>;
  ejecuciones: RepoFake<EntrenamientoEjecucion>;
  python: {
    salud: jest.Mock;
    entrenar: jest.Mock;
    activar: jest.Mock;
    desactivar: jest.Mock;
    modeloActual: jest.Mock;
  };
  dataset: { reconstruir: jest.Mock };
  entrenamientoService: { siguienteVersion: jest.Mock; activar: jest.Mock };
  evaluacion: { registrarBacktest: jest.Mock };
}

function construirArnes(opciones?: {
  muestras?: MuestraCalculada[];
  campeon?: Partial<ModeloVersion> | null;
}): Arnes {
  const totalMuestras = opciones?.muestras ?? fabricarMuestras();
  const campeonFila = opciones?.campeon === null ? [] : [
    {
      version: 'v2.1',
      objetivo: OBJETIVO_PERSISTIDO,
      estado: 'vigente',
      proveedor: 'python-gbm',
      entrenadoEn: fechaEn(0),
      eventos: 200,
      auc: 0.7,
      f1: 0.5,
      precision: 45,
      recall: 60,
      features: 1,
      alertas30d: 0,
      algoritmo: 'LightGBM 4.5',
      orden: 0,
      coeficientes: null,
      umbralDecision: 40,
      vp: 30,
      fp: 25,
      vn: 90,
      fn: 25,
      brier: 0.19,
      liftTop3: 1.4,
      aucPrueba: 0.68,
      aucRetro: 0.8,
      corteEntrenamiento: null,
      cortePrueba: null,
      importancias: [],
      perfilDatos: null,
      error: null,
      ...(opciones?.campeon ?? {}),
    } as ModeloVersion,
  ];

  const versiones = crearRepoFake<ModeloVersion>('version', campeonFila);
  const ejecuciones = crearRepoFake<EntrenamientoEjecucion>('id', []);

  const python = {
    salud: jest.fn(async () => SALUD_OK),
    entrenar: jest.fn(async (cuerpo: EntrenarRequest): Promise<EntrenarResponse> => ({
      runId: `TRAIN-${cuerpo.version}`,
      resultados: { parada_imprevista: construirResultado(cuerpo) },
      duracionMs: 1000,
    })),
    activar: jest.fn(async () => undefined),
    desactivar: jest.fn(async () => undefined),
    modeloActual: jest.fn(async () => undefined),
  };

  const dataset = {
    reconstruir: jest.fn(async () => ({
      muestras: totalMuestras,
      catalogo: fabricarCatalogo(),
      perfil: fabricarPerfil(totalMuestras.filter((m) => m.modo === 'anticipado').length),
    })),
  };

  const entrenamientoService = {
    siguienteVersion: jest.fn(async () => 'v2.4'),
    activar: jest.fn(async () => undefined),
  };

  const evaluacion = { registrarBacktest: jest.fn(async () => 0) };

  const alertas = { count: jest.fn(async () => 0) };

  const dataSource = { options: { type: 'sqlite' } };

  const servicio = new EntrenamientoContinuoService(
    dataSource as never,
    dataset as never,
    evaluacion as never,
    entrenamientoService as never,
    python as never,
    versiones as never,
    ejecuciones as never,
    alertas as never,
  );

  return { servicio, versiones, ejecuciones, python, dataset, entrenamientoService, evaluacion };
}

/* ------------------------------------------------------------------ */
/* Tests                                                                */
/* ------------------------------------------------------------------ */

describe('EntrenamientoContinuoService', () => {
  it('promueve al candidato cuando mejora PR-AUC, Brier y recall sobre el campeón reevaluado', async () => {
    const arnes = construirArnes();

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.estado).toBe('completado');
    expect(ejecucion.decision).toBe('promovido');
    expect(arnes.python.entrenar).toHaveBeenCalledTimes(1);
    expect(arnes.python.activar).toHaveBeenCalledWith('parada_imprevista', 'v2.4');
    expect(arnes.entrenamientoService.activar).toHaveBeenCalledWith('v2.4');
    expect(arnes.evaluacion.registrarBacktest).toHaveBeenCalledTimes(1);

    const fila = arnes.versiones.filas.find((f) => f.version === 'v2.4');
    expect(fila?.estado).toBe('vigente');
    expect(fila?.promovida).toBe(true);
    expect(fila?.proveedor).toBe('python-gbm');
  });

  it('mantiene al incumbente cuando el candidato no mejora el PR-AUC lo suficiente', async () => {
    const arnes = construirArnes();
    arnes.python.entrenar.mockImplementation(async (cuerpo: EntrenarRequest) => ({
      runId: `TRAIN-${cuerpo.version}`,
      resultados: {
        parada_imprevista: construirResultado(cuerpo, {
          walkForward: { ...WALK_FORWARD_CANDIDATO_GANA, prAuc: 0.59 },
          campeonReevaluado: { version: 'v2.1', walkForward: { ...WALK_FORWARD_INCUMBENTE, prAuc: 0.61 } },
        }),
      },
      duracionMs: 1000,
    }));

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.estado).toBe('completado');
    expect(ejecucion.decision).toBe('incumbente');
    expect(ejecucion.motivo).toMatch(/0\.590 vs 0\.610/);
    expect(arnes.python.activar).not.toHaveBeenCalled();
    expect(arnes.entrenamientoService.activar).not.toHaveBeenCalled();

    const fila = arnes.versiones.filas.find((f) => f.version === 'v2.4');
    expect(fila?.estado).toBe('archivada');
    expect(fila?.promovida).toBe(false);
    /* El campeón v2.1 sigue vigente: no se tocó. */
    const campeon = arnes.versiones.filas.find((f) => f.version === 'v2.1');
    expect(campeon?.estado).toBe('vigente');
  });

  it('rechaza al candidato por debajo del guardarraíl de AUC mínima aunque el PR-AUC mejore', async () => {
    const arnes = construirArnes();
    arnes.python.entrenar.mockImplementation(async (cuerpo: EntrenarRequest) => ({
      runId: `TRAIN-${cuerpo.version}`,
      resultados: {
        parada_imprevista: construirResultado(cuerpo, {
          walkForward: { ...WALK_FORWARD_CANDIDATO_GANA, aucRoc: 0.5, prAuc: 0.9 },
        }),
      },
      duracionMs: 1000,
    }));

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.decision).toBe('incumbente');
    expect(ejecucion.motivo).toMatch(/mínimo 0\.55/);
    expect(arnes.python.activar).not.toHaveBeenCalled();
  });

  it('no entrena si hay menos de MIN_MUESTRAS filas «anticipado»', async () => {
    const arnes = construirArnes({ muestras: fabricarMuestras(10, 5) }); // 50 filas < 200

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.estado).toBe('error');
    expect(ejecucion.error).toMatch(new RegExp(String(MIN_MUESTRAS)));
    expect(arnes.python.entrenar).not.toHaveBeenCalled();
  });

  it('omite el entrenamiento si Python no responde a GET /salud', async () => {
    const arnes = construirArnes();
    arnes.python.salud.mockResolvedValue(null);

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.estado).toBe('omitido');
    expect(arnes.dataset.reconstruir).not.toHaveBeenCalled();
    expect(arnes.python.entrenar).not.toHaveBeenCalled();
  });

  it('entrena igualmente si Python está degradado: es el estado normal antes del primer modelo', async () => {
    /* Regresión encontrada en integración real: exigir `estado === 'ok'` para
     * entrenar creaba un bloqueo circular —Python reporta `degradado` mientras
     * no tenga modelo cargado, y no puede tener uno hasta que se entrene—, así
     * que el primer entrenamiento nunca llegaba a ocurrir. `degradado` sólo
     * afecta a `/predict`, no a `/entrenar`. */
    const arnes = construirArnes();
    arnes.python.salud.mockResolvedValue({ estado: 'degradado', modeloCargado: false, version: null, sklearn: '1.5', uptimeS: 5 });

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.estado).not.toBe('omitido');
    expect(arnes.python.entrenar).toHaveBeenCalled();
  });

  it('rechaza duro la corrida si los pliegues de Python no coinciden con los de Nest', async () => {
    const arnes = construirArnes();
    arnes.python.entrenar.mockImplementation(async (cuerpo: EntrenarRequest) => ({
      runId: `TRAIN-${cuerpo.version}`,
      resultados: {
        parada_imprevista: construirResultado(cuerpo, {
          pliegues: [{ entrenamientoHasta: '1999-01-01', validacionDesde: '1999-01-02', validacionHasta: '1999-01-03' }],
        }),
      },
      duracionMs: 1000,
    }));

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.estado).toBe('error');
    expect(ejecucion.error).toMatch(/Pliegues/);
    expect(arnes.python.activar).not.toHaveBeenCalled();
    const fila = arnes.versiones.filas.find((f) => f.version === 'v2.4');
    expect(fila?.estado).toBe('archivada');
  });

  it('registra el rechazo de Python (422, snapshot inválido) como error duro sin promover nada', async () => {
    const arnes = construirArnes();
    arnes.python.entrenar.mockRejectedValue(
      new PythonEntrenamientoError('HTTP 422', 422, { message: 'snapshot.sha256 no coincide con el recalculado' }),
    );

    const ejecucion = await arnes.servicio.ejecutar('manual');

    expect(ejecucion.estado).toBe('error');
    expect(ejecucion.error).toMatch(/422/);
    expect(ejecucion.error).toMatch(/snapshot/);
    expect(arnes.python.activar).not.toHaveBeenCalled();
    const fila = arnes.versiones.filas.find((f) => f.version === 'v2.4');
    expect(fila?.estado).toBe('archivada');
  });

  it('lanza ConflictoException si ya hay una versión entrenando (lock ocupado)', async () => {
    const arnes = construirArnes();
    arnes.versiones.filas.push({
      version: 'v2.4-en-curso',
      objetivo: OBJETIVO_PERSISTIDO,
      estado: 'entrenando',
      iniciadoEn: ahoraIso(),
      entrenadoEn: fechaEn(34),
    } as ModeloVersion);

    await expect(arnes.servicio.ejecutar('manual')).rejects.toBeInstanceOf(ConflictoException);
    expect(arnes.python.entrenar).not.toHaveBeenCalled();
  });

  it('archiva filas modelo_version y entrenamiento_ejecucion huérfanas (más de 2 h en curso)', async () => {
    const arnes = construirArnes();
    const hace3Horas = ahoraIso(new Date(Date.now() - 3 * 60 * 60 * 1000));
    arnes.versiones.filas.push({
      version: 'v2.3-huerfana',
      objetivo: OBJETIVO_PERSISTIDO,
      estado: 'entrenando',
      iniciadoEn: hace3Horas,
      entrenadoEn: hace3Horas.slice(0, 10),
    } as ModeloVersion);
    arnes.ejecuciones.filas.push({
      id: 'EJEC-huerfana',
      disparador: 'cron',
      estado: 'en_curso',
      version: 'v2.3-huerfana',
      objetivo: OBJETIVO_PERSISTIDO,
      iniciadoEn: hace3Horas,
    } as EntrenamientoEjecucion);

    const total = await arnes.servicio.limpiarHuerfanas();

    expect(total).toBe(2);
    const filaVersion = arnes.versiones.filas.find((f) => f.version === 'v2.3-huerfana');
    expect(filaVersion?.estado).toBe('archivada');
    expect(filaVersion?.error).toMatch(/huérfano/);
    const filaEjecucion = arnes.ejecuciones.filas.find((f) => f.id === 'EJEC-huerfana');
    expect(filaEjecucion?.estado).toBe('error');
    expect(filaEjecucion?.error).toMatch(/huérfana/);
  });

  it('no toca una fila «entrenando» reciente (dentro de las 2 h)', async () => {
    const arnes = construirArnes();
    arnes.versiones.filas.push({
      version: 'v2.3-reciente',
      objetivo: OBJETIVO_PERSISTIDO,
      estado: 'entrenando',
      iniciadoEn: ahoraIso(),
      entrenadoEn: fechaEn(34),
    } as ModeloVersion);

    await arnes.servicio.limpiarHuerfanas();

    const fila = arnes.versiones.filas.find((f) => f.version === 'v2.3-reciente');
    expect(fila?.estado).toBe('entrenando');
  });

  it('archiva la versión vigente si Python ya no tiene su artefacto activo (reconciliación de arranque)', async () => {
    const arnes = construirArnes();
    arnes.python.modeloActual.mockResolvedValue(null); // 404: sin modelo activo

    await arnes.servicio.reconciliarConPython();

    const campeon = arnes.versiones.filas.find((f) => f.version === 'v2.1');
    expect(campeon?.estado).toBe('archivada');
    expect(campeon?.error).toBe('artefacto perdido');
  });

  it('no toca la vigente si Python está simplemente inalcanzable (no penaliza una caída transitoria)', async () => {
    const arnes = construirArnes();
    arnes.python.modeloActual.mockResolvedValue(undefined); // Python no respondió

    await arnes.servicio.reconciliarConPython();

    const campeon = arnes.versiones.filas.find((f) => f.version === 'v2.1');
    expect(campeon?.estado).toBe('vigente');
  });
});
