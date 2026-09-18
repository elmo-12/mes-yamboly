/**
 * Entrenamiento del modelo de analítica: `pnpm --filter @mes/api entrenar`.
 *
 * Dispara el **mismo** orquestador champion/challenger que corre dentro de la
 * API al pulsar «Reentrenar» (`EntrenamientoContinuoService.ejecutar()`):
 * lock → limpiar huérfanas → reconstruir el feature store (snapshot) →
 * `GET /salud` → `POST /entrenar` contra `services/prediccion-py` → verificar
 * pliegues → decidir champion/challenger → persistir `modelo_version` →
 * activar en Python → backtest.
 *
 * Python es el único motor de modelado (F5): este script **no entrena nada en
 * TypeScript**. Si el servicio de predicción no responde, falla con un
 * mensaje claro y sale con código 1 — no inventa un modelo local.
 *
 * Opciones:
 *   --url=postgres://…   base a entrenar (por defecto `DATABASE_URL`)
 *   --csv=ruta.csv        vuelca además el feature store en CSV
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { crearDataSource } from '../src/database/data-source';
import { ModeloVersion, MuestraAnalitica } from '../src/database/entities';
import { crearPipelineAnalitica } from '../src/modules/analytics/pipeline.factory';
import { OBJETIVO_PERSISTIDO } from '../src/modules/analytics/modelado';

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
    const { entrenamientoContinuo } = crearPipelineAnalitica(dataSource);
    const ejecucion = await entrenamientoContinuo.ejecutar('manual');

    if (ejecucion.estado === 'omitido') {
      const url = process.env.PREDICTION_SERVICE_URL || '(sin configurar)';
      console.error(
        `\n  El servicio de predicción no responde en PREDICTION_SERVICE_URL=${url}; ` +
          'arráncalo con `pnpm prediccion:up`.\n' +
          `  Detalle: ${ejecucion.motivo ?? ejecucion.error ?? 'sin más detalle'}\n`,
      );
      process.exitCode = 1;
      return;
    }

    if (ejecucion.estado === 'error') {
      console.error(`\n  El entrenamiento no se completó: ${ejecucion.motivo ?? ejecucion.error ?? 'sin más detalle'}\n`);
      process.exitCode = 1;
      return;
    }

    const fila = await dataSource
      .getRepository(ModeloVersion)
      .findOne({ where: { version: ejecucion.version, objetivo: OBJETIVO_PERSISTIDO } });
    if (!fila) {
      console.error(`\n  Entrenamiento completado pero no se encontró la fila ${ejecucion.version} en modelo_version.\n`);
      process.exitCode = 1;
      return;
    }
    const p = fila.perfilDatos;

    if (p) {
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
      console.log(`  Features                    ${fila.features}`);
      console.log(`  Regla del target            ${p.reglaTarget} (umbral ${p.umbralMinutos} min)`);
      console.log(`  Tasa de positivos           ${pct(p.tasaPositivos)}`);
    }

    console.log('\n── Fases 4 y 5 · Modelado y evaluación (services/prediccion-py) ');
    console.log(`  Versión              ${fila.version}`);
    console.log(`  Algoritmo ganador    ${fila.algoritmo}`);
    console.log(`  PR-AUC (primaria)    ${fila.prAuc?.toFixed(3) ?? '—'}`);
    console.log(`  ROC-AUC              ${fila.auc.toFixed(3)}`);
    console.log(`  AUC corte único      ${fila.aucPrueba.toFixed(3)}`);
    console.log(`  AUC techo (retro)    ${fila.aucRetro.toFixed(3)}  · no desplegable, sólo referencia`);
    console.log(`  F1                   ${fila.f1.toFixed(3)}`);
    console.log(`  Precisión / Recall   ${fila.precision} % / ${fila.recall} %`);
    console.log(`  Brier                ${fila.brier.toFixed(4)}`);
    console.log(`  Matriz de confusión  VP ${fila.vp} · FP ${fila.fp} · VN ${fila.vn} · FN ${fila.fn}`);
    console.log(`  Lift@top-3 líneas    ${fila.liftTop3.toFixed(2)}`);
    console.log(`  Umbral de decisión   ${fila.umbralDecision} %`);
    console.log(`\n  Decisión champion/challenger: ${fila.promovida ? 'promovido a vigente' : 'incumbente conservado'}`);
    console.log(`  Motivo: ${fila.razonPromocion ?? ejecucion.motivo ?? 'sin más detalle'}`);

    const csv = opcion('csv');
    if (csv) {
      const filas = await dataSource
        .getRepository(MuestraAnalitica)
        .find({ order: { inicioTurno: 'ASC', lineaCodigo: 'ASC' } });
      writeFileSync(csv, aCsv(filas), 'utf-8');
      console.log(`\n  Feature store volcado en ${csv} (${filas.length} filas)`);
    }
    console.log('');
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
