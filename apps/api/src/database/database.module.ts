import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { EnvVars } from '../config/env.validation';
import { ENTITIES } from './data-source';
import { ejecutarSeeds, hayDatos } from './seeds';

/** Siembra la BD al arrancar sólo si está vacía (arranque en frío). */
@Injectable()
export class SeedOnBootService implements OnModuleInit {
  private readonly logger = new Logger(SeedOnBootService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (await hayDatos(this.dataSource)) return;
    this.logger.log('Base de datos vacía: ejecutando seeds…');
    await ejecutarSeeds(this.dataSource);
    this.logger.log('Seeds completados');
  }
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        type: 'sqlite' as const,
        database: String(config.get('DB_PATH', { infer: true })),
        /* `ENTITIES` cubre todo `entities/index.ts` aunque un módulo aún no
         * registre su `forFeature`; `autoLoadEntities` suma las que lleguen después. */
        entities: ENTITIES,
        autoLoadEntities: true,
        synchronize: true,
        logging: false,
      }),
    }),
  ],
  providers: [SeedOnBootService],
})
export class DatabaseModule {}
