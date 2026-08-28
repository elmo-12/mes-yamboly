import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from './env.validation';
import type { EnvVars } from './env.validation';

/** `ConfigService` tipado con el esquema de `env.validation`. */
export type TypedConfigService = ConfigService<EnvVars, true>;

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
