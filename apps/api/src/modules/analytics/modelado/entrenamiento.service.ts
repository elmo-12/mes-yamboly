import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import type { VariableEntrada } from '@mes/types';
import { ahoraIso, hoyIso } from '../../../common/utils';
import { Alerta, ModeloVersion, type PerfilDatos } from '../../../database/entities';
import {
  DatasetBuilderService,
  type DefinicionFeature,
  type MuestraCalculada,
  ETIQUETA_GRUPO,
  catalogoAnticipado,
  grupoPorNombre,
  vectorizar,
} from '../dataset';
import { EvaluacionService } from './evaluacion.service';
import { entrenarLogistica } from './regresion-logistica';

/** Mínimo de muestras para que entrenar tenga sentido (guardarraíl §7.3). */
export const MIN_MUESTRAS = 40;

export const ALGORITMO = 'Regresión logística L2 (TypeScript)';

export interface ResultadoEntrenamiento {
  version: string;
  muestras: number;
  features: number;
  auc: number;
  f1: number;
  precision: number;
  recall: number;
  brier: number;
  liftTop3: number;
  umbralDecision: number;
  lambda: number;
  aucPrueba: number;
  aucRetro: number;
  perfil: PerfilDatos;
}

/** El pipeline no pudo correr: el llamador decide si eso es un 404 o un warning. */
export class DatosInsuficientesError extends Error {}

/**
 * Fase 4 de CRISP-DM: orquesta `construir dataset → validar → entrenar → versionar`.
 *
 * Se entrena **sólo con las muestras `anticipado`**: el modelo que se despliega
 * y el que se evalúa tienen que ser el mismo, o las métricas publicadas no
 * describirían nada reproducible en planta (§4.2, R4).
 */
@Injectable()
export class EntrenamientoService {
  private readonly logger = new Logger(EntrenamientoService.name);

  constructor(
    private readonly dataset: DatasetBuilderService,
    private readonly evaluacion: EvaluacionService,
    @InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
  ) {}

  /**
   * Ejecuta el pipeline completo y deja la versión `vigente`.
   * `version` permite reutilizar una fila ya creada en estado `entrenando`
   * (es el camino del botón «Reentrenar», que responde 202 antes de terminar).
   */
  async entrenar(version?: string): Promise<ResultadoEntrenamiento> {
    const inicio = Date.now();
    const { muestras, catalogo, perfil } = await this.dataset.reconstruir();
    const anticipadas = muestras.filter((m) => m.modo === 'anticipado');
    if (anticipadas.length < MIN_MUESTRAS) {
      throw new DatosInsuficientesError(
        `Sólo hay ${anticipadas.length} muestras; se necesitan ${MIN_MUESTRAS}`,
      );
    }

    const nombres = catalogoAnticipado(catalogo).map((f) => f.nombre);
    const resultado = this.evaluacion.evaluarModelo(anticipadas, nombres);

    /* Techo de referencia: el mismo pipeline sobre las muestras `retro`. No se
     * despliega nunca (vería el turno que intenta predecir); sirve para saber
     * cuánto se paga por predecir de verdad por adelantado. */
    const retro = muestras.filter((m) => m.modo === 'retro');
    const aucRetro = retro.length
      ? this.evaluacion.evaluarModelo(retro, catalogo.map((f) => f.nombre)).walkForward.auc
      : 0;

    /* Modelo final: todas las muestras con la lambda que ganó la validación. */
    const X = anticipadas.map((m) => vectorizar(m.features, nombres));
    const y = anticipadas.map((m) => m.huboParadaImprevista);
    const modelo = entrenarLogistica(X, y, nombres, { lambdaL2: resultado.lambda });

    const nombreVersion = version ?? (await this.siguienteVersion());
    const alertas30d = await this.contarAlertas30d();
    const importancias = this.importancias(modelo.pesos, nombres, catalogoAnticipado(catalogo));

    const fila =
      (await this.versiones.findOne({ where: { version: nombreVersion } })) ??
      this.versiones.create({ version: nombreVersion, orden: 0 });

    Object.assign(fila, {
      entrenadoEn: hoyIso(),
      eventos: anticipadas.length,
      auc: redondear(resultado.walkForward.auc, 3),
      f1: redondear(resultado.walkForward.f1, 3),
      precision: redondear(resultado.walkForward.precision * 100, 1),
      recall: redondear(resultado.walkForward.recall * 100, 1),
      features: nombres.length,
      alertas30d,
      algoritmo: ALGORITMO,
      objetivo: 'parada_imprevista' as const,
      proveedor: 'local-logistica' as const,
      coeficientes: {
        nombres: modelo.nombres,
        pesos: modelo.pesos,
        sesgo: modelo.sesgo,
        medias: modelo.medias,
        desviaciones: modelo.desviaciones,
        lambdaL2: modelo.lambdaL2,
        iteraciones: modelo.iteraciones,
      },
      umbralDecision: redondear(resultado.umbral * 100, 1),
      vp: resultado.walkForward.vp,
      fp: resultado.walkForward.fp,
      vn: resultado.walkForward.vn,
      fn: resultado.walkForward.fn,
      brier: redondear(resultado.walkForward.brier, 4),
      liftTop3: resultado.liftTop3,
      aucPrueba: redondear(resultado.aucPrueba, 3),
      aucRetro: redondear(aucRetro, 3),
      corteEntrenamiento: resultado.corteEntrenamiento,
      cortePrueba: resultado.cortePrueba,
      importancias,
      perfilDatos: perfil,
      error: null,
      estado: 'entrenando' as const,
    });
    await this.versiones.save(fila);

    await this.evaluacion.registrarBacktest(resultado.fuera, resultado.umbral, nombreVersion);
    await this.activar(nombreVersion);

    this.logger.log(
      `${nombreVersion} entrenada en ${Date.now() - inicio} ms · ${anticipadas.length} muestras · ` +
        `AUC ${fila.auc} · F1 ${fila.f1} · λ ${resultado.lambda} · umbral ${fila.umbralDecision} %`,
    );

    return {
      version: nombreVersion,
      muestras: anticipadas.length,
      features: nombres.length,
      auc: fila.auc,
      f1: fila.f1,
      precision: fila.precision,
      recall: fila.recall,
      brier: fila.brier,
      liftTop3: fila.liftTop3,
      umbralDecision: fila.umbralDecision,
      lambda: resultado.lambda,
      aucPrueba: fila.aucPrueba,
      aucRetro: fila.aucRetro,
      perfil,
    };
  }

  /** Deja `version` vigente, archiva el resto y reordena por antigüedad. */
  async activar(version: string): Promise<void> {
    const filas = await this.versiones.find();
    for (const f of filas) {
      if (f.estado === 'entrenando' && f.version !== version) continue;
      f.estado = f.version === version ? 'vigente' : 'archivada';
    }
    const ordenadas = filas.sort((a, b) => {
      if (a.estado === 'vigente') return -1;
      if (b.estado === 'vigente') return 1;
      return b.entrenadoEn.localeCompare(a.entrenadoEn) || b.version.localeCompare(a.version);
    });
    ordenadas.forEach((f, i) => (f.orden = i));
    await this.versiones.save(ordenadas);
  }

  /** `v1.0` la primera vez; después incrementa el menor de la versión más alta. */
  async siguienteVersion(): Promise<string> {
    const filas = await this.versiones.find();
    const numeros = filas
      .map((f) => /^v(\d+)\.(\d+)$/.exec(f.version))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => ({ mayor: Number(m[1]), menor: Number(m[2]) }))
      .sort((a, b) => b.mayor - a.mayor || b.menor - a.menor);
    const alta = numeros[0];
    return alta ? `v${alta.mayor}.${alta.menor + 1}` : 'v1.0';
  }

  /**
   * Importancia por **grupo** de features, no por columna: la UI muestra ocho
   * filas («Línea», «Turno», «Eventos históricos 7 d»…), y repartir el one-hot
   * de nueve líneas en nueve filas de 3 % no le diría nada al supervisor.
   */
  private importancias(
    pesos: readonly number[],
    nombres: readonly string[],
    catalogo: readonly DefinicionFeature[],
  ): VariableEntrada[] {
    const grupos = grupoPorNombre(catalogo);
    const acumulado = new Map<string, number>();
    nombres.forEach((nombre, j) => {
      const grupo = grupos.get(nombre);
      if (!grupo) return;
      acumulado.set(grupo, (acumulado.get(grupo) ?? 0) + Math.abs(pesos[j] ?? 0));
    });
    const maximo = Math.max(1e-9, ...acumulado.values());
    return [...acumulado.entries()]
      .map(([grupo, valor]) => ({
        grupo,
        nombre: ETIQUETA_GRUPO[grupo as keyof typeof ETIQUETA_GRUPO] ?? grupo,
        importancia: Math.round((valor / maximo) * 100),
      }))
      .sort((a, b) => b.importancia - a.importancia)
      .map((v, i) => ({
        id: `VAR-${String(i + 1).padStart(2, '0')}`,
        nombre: v.nombre,
        importancia: v.importancia,
      }));
  }

  private async contarAlertas30d(): Promise<number> {
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    return this.alertas.count({ where: { generadaEn: MoreThanOrEqual(ahoraIso(desde)) } });
  }
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Number.isFinite(valor) ? Math.round(valor * factor) / factor : 0;
}

/** Reexportado para que el llamador pueda tipar el resultado sin importar el dataset. */
export type { MuestraCalculada };
