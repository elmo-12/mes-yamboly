// Primer arranque sobre el recorte de datos reales (`docker/semilla/mes.sqlite`):
// la base ya trae usuarios, así que la API no siembra y, por tanto, tampoco
// entrena. Este script corre el mismo paso de analítica que la siembra
// (`ThesisAnalyticsSeeder` → `entrenamientoContinuo.ejecutar('arranque')`)
// contra el SQLite, con Python ya levantado y antes de arrancar la API.
require('reflect-metadata');
const { crearDataSource } = require('./dist/database/data-source');
const { ThesisAnalyticsSeeder } = require('./dist/database/seeds/thesis-analytics.seed');

async function main() {
  const dataSource = crearDataSource(process.env.DB_PATH || './data/mes.sqlite');
  await dataSource.initialize();
  try {
    await new ThesisAnalyticsSeeder().run(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('No se pudo entrenar el modelo inicial:', error);
  process.exitCode = 1;
});
