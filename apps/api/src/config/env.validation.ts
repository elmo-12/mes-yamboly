import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET debe tener al menos 8 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  /**
   * PostgreSQL (Docker local): `postgres://mes:mes_dev@localhost:5432/mes_yamboly`.
   * Si está presente manda sobre `DB_PATH`; si falta se usa SQLite (e2e, respaldo).
   */
  DATABASE_URL: z.string().url().optional().or(z.literal('')),
  DB_PATH: z.string().default('./data/mes.sqlite'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  /** Origen público de la web; si falta se usa `CORS_ORIGIN` (enlaces de encuesta). */
  WEB_URL: z.string().optional(),
  PREDICTION_SERVICE_URL: z.string().url().optional().or(z.literal('')),
  PREDICTION_TIMEOUT_MS: z.coerce.number().default(1500),
  SWAGGER_PATH: z.string().default('docs'),
});

export type EnvVars = z.infer<typeof envSchema>;

/** Validador que `ConfigModule` ejecuta al arrancar: falla rápido y claro. */
export function validateEnv(config: Record<string, unknown>): EnvVars {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detalle}`);
  }
  return parsed.data;
}
