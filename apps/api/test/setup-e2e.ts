/** SQLite en memoria para los e2e: cada suite arranca con la BD sembrada. */
/* `process.env` gana sobre el `.env` que carga `ConfigModule`, así que vaciar
 * `DATABASE_URL` mantiene los e2e en SQLite aunque el entorno apunte a Postgres. */
process.env.DATABASE_URL = '';
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secreto-de-pruebas-mes';
jest.setTimeout(120_000);
