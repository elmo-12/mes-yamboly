import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import type { VariableEntrada } from '@mes/types';
import { ahoraIso } from '../../../common/utils';
import { Alerta, ModeloVersion } from '../../../database/entities';
import { type DefinicionFeature, ETIQUETA_GRUPO, grupoPorNombre } from '../dataset';

/** El pipeline no pudo correr: el llamador decide si eso es un 404 o un warning. */
export class DatosInsuficientesError extends Error {}

/**
 * Versionado y activación de `modelo_version`, compartidos por cualquier
 * motor de entrenamiento.
 *
 * **Python es el único motor de modelado (F5).** El pipeline TS heredado
 * (regresión logística local, entrenador puro sin Nest) se retiró junto con
 * su método `entrenar()`: el único camino de producción es
 * `EntrenamientoContinuoService`, que entrena contra `services/prediccion-py`
 * y decide qué versión queda `vigente`. Lo que sí sigue usando el
 * orquestador de aquí son `siguienteVersion()`, `activar()` e
 * `importancias()`: la numeración de versión, el archivado y el reparto de
 * importancia por grupo de features son los mismos con cualquier motor.
 */
@Injectable()
export class EntrenamientoService {
  constructor(
    @InjectRepository(ModeloVersion) private readonly versiones: Repository<ModeloVersion>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
  ) {}

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
   *
   * Se conserva para cualquier consumidor futuro que necesite volver a repartir
   * pesos por grupo (p. ej. reprocesar una versión antigua); el orquestador
   * Python ya entrega `importancias` agrupadas en la propia respuesta de
   * `/entrenar`, así que `EntrenamientoContinuoService` no llama a este método.
   */
  importancias(
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

/** Reexportado para que el llamador pueda tipar el resultado sin importar el dataset. */
export type { MuestraCalculada } from '../dataset';
