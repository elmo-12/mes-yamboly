import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { EnvVars } from '../config/env.validation';
import { opcionesDataSource } from './data-source';
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
        /* PostgreSQL cuando hay `DATABASE_URL`; SQLite en caso contrario. Las
         * `ENTITIES` cubren todo `entities/index.ts` aunque un módulo aún no
         * registre su `forFeature`; `autoLoadEntities` suma las que lleguen después. */
        ...opcionesDataSource({
          databaseUrl: config.get('DATABASE_URL', { infer: true }),
          dbPath: String(config.get('DB_PATH', { infer: true })),
        }),
        autoLoadEntities: true,
      }),
    }),
  ],
  providers: [SeedOnBootService],
})
export class DatabaseModule {}
