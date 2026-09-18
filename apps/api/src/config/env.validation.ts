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
  /** Timeout de `POST /entrenar` (bloque B): puede tardar hasta 10 min (§3 del contrato). */
  PREDICTION_TRAIN_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  /** Cabecera `X-Internal-Token` que exige Python en las mutaciones de `/modelo/*` cuando está definida. */
  PREDICCION_TOKEN: z.string().optional(),
  /**
   * `'true'`/`'false'` como texto, no boolean: igual que `INFERENCIA_ACTIVA`,
   * se lee tal cual con `!== 'false'`/`=== 'true'` (ver `inferenciaActiva()` y
   * `entrenamientoContinuoActivo()`) — `z.coerce.boolean()` convertiría
   * `"false"` en `true` porque `Boolean("false")` es `true`.
   */
  ENTRENAMIENTO_ACTIVO: z.string().optional(),
  ENTRENAMIENTO_CRON: z.string().default('0 3 * * 1'),
  /** Ya se leía en `inferencia.scheduler.ts`; aquí sólo se valida el formato. */
  INFERENCIA_ACTIVA: z.string().optional(),
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
