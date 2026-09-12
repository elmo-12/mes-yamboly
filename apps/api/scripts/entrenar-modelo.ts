/**
 * Entrenamiento del modelo de analítica: `pnpm --filter @mes/api entrenar`.
 *
 * Ejecuta el pipeline CRISP-DM completo contra la base configurada
 * (`DATABASE_URL`, o el SQLite de `DB_PATH` si no hay Postgres):
 * perfilar → construir el feature store → validar temporalmente → entrenar →
 * versionar → rehacer el backtest. Es el **mismo** código que corre dentro de la
 * API al pulsar «Reentrenar», así que las métricas que imprime aquí son las que
 * la pestaña Modelo muestra.
 *
 * Con semilla fija y sin barajado el resultado es reproducible: dos corridas
 * sobre el mismo corpus dan los mismos pesos y las mismas métricas.
 *
 * Opciones:
 *   --url=postgres://…   base a entrenar (por defecto `DATABASE_URL`)
 *   --version=v2.0       nombre de la versión (por defecto, la siguiente)
 *   --csv=ruta.csv       vuelca además el feature store en CSV
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearDataSource } from '../src/database/data-source';
import { MuestraAnalitica } from '../src/database/entities';
import { crearPipelineAnalitica } from '../src/modules/analytics/pipeline.factory';
import { DatosInsuficientesError } from '../src/modules/analytics/modelado';

/** Lector minimalista de `.env` (el script corre fuera del contexto Nest). */
function cargarEnv(archivo = '.env'): void {
  const ruta = resolve(process.cwd(), archivo);
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const separador = limpia.indexOf('=');
    if (separador < 0) continue;
    const clave = limpia.slice(0, separador).trim();
    const valor = limpia.slice(separador + 1).trim().replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

function opcion(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(prefijo))?.slice(prefijo.length);
}

function pct(valor: number): string {
  return `${(valor * 100).toFixed(1)} %`;
}

/** Vuelca el feature store con una columna por feature, para analizarlo fuera. */
function aCsv(filas: MuestraAnalitica[]): string {
  if (!filas.length) return 'sin_muestras\n';
  const nombres = [...new Set(filas.flatMap((f) => Object.keys(f.features)))].sort();
  const cabecera = [
    'lineaCodigo',
    'fecha',
    'turno',
    'modo',
    'huboParadaImprevista',
    'mermaSobreEstandar',
    'minutosImprevistos',
    ...nombres,
  ];
  const cuerpo = filas.map((f) =>
    [
      f.lineaCodigo,
      f.fecha,
      f.turno,
      f.modo,
      f.huboParadaImprevista,
      f.mermaSobreEstandar,
      f.minutosImprevistos,
      ...nombres.map((n) => f.features[n] ?? ''),
    ].join(','),
  );
  return [cabecera.join(','), ...cuerpo].join('\n');
}

async function main(): Promise<void> {
  cargarEnv('.env.local');
  cargarEnv('.env');

  const dataSource = crearDataSource({
    databaseUrl: opcion('url') ?? process.env.DATABASE_URL,
    dbPath: process.env.DB_PATH,
  });
  await dataSource.initialize();

  try {
    const { entrenamiento } = crearPipelineAnalitica(dataSource);
    const resultado = await entrenamiento.entrenar(opcion('version'));
    const p = resultado.perfil;

    console.log('\n── Fase 2 · Comprensión de los datos ──────────────────────────');
    console.log(`  Ventana            ${p.desde} → ${p.hasta} (${p.lineas} líneas)`);
    console.log(`  Corpus             ${p.ordenes} órdenes · ${p.paradas} paradas · ${p.mermas} mermas`);
    console.log(`  Paradas sin cat.   ${p.pctParadasSinCategorizar} %`);
    console.log(`  Causas raíz        ${p.tiposCausa.join(', ')}`);
    for (const [columna, nulos] of Object.entries(p.columnasConNulos)) {
      console.log(`  Nulos              ${columna}: ${nulos}`);
    }

    console.log('\n── Fase 3 · Preparación ───────────────────────────────────────');
    console.log(`  Muestras (modo anticipado)  ${p.muestras}`);
    console.log(`  Features                    ${resultado.features}`);
    console.log(`  Regla del target            ${p.reglaTarget} (umbral ${p.umbralMinutos} min)`);
    console.log(`  Tasa de positivos           ${pct(p.tasaPositivos)}`);

    console.log('\n── Fases 4 y 5 · Modelado y evaluación ────────────────────────');
    console.log(`  Versión             ${resultado.version}`);
    console.log(`  Regularización L2   λ = ${resultado.lambda}`);
    console.log(`  AUC walk-forward    ${resultado.auc.toFixed(3)}`);
    console.log(`  AUC corte único     ${resultado.aucPrueba.toFixed(3)}`);
    console.log(`  AUC techo (retro)   ${resultado.aucRetro.toFixed(3)}  · no desplegable, sólo referencia`);
    console.log(`  F1                  ${resultado.f1.toFixed(3)}`);
    console.log(`  Precisión / Recall  ${resultado.precision} % / ${resultado.recall} %`);
    console.log(`  Brier               ${resultado.brier.toFixed(4)}`);
    console.log(`  Lift@top-3 líneas   ${resultado.liftTop3.toFixed(2)}`);
    console.log(`  Umbral óptimo (F1)  ${resultado.umbralDecision} %`);

    const csv = opcion('csv');
    if (csv) {
      const filas = await dataSource
        .getRepository(MuestraAnalitica)
        .find({ order: { inicioTurno: 'ASC', lineaCodigo: 'ASC' } });
      writeFileSync(csv, aCsv(filas), 'utf-8');
      console.log(`\n  Feature store volcado en ${csv} (${filas.length} filas)`);
    }
    console.log('');
  } catch (error: unknown) {
    if (error instanceof DatosInsuficientesError) {
      console.error(`\n  No hay corpus suficiente para entrenar: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
