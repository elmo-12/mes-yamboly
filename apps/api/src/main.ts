import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import type { EnvVars } from './config/env.validation';
import { toList } from './common/utils/query';
import { crearValidationPipe } from './common/pipes/validation.pipe';

const TAGS: Array<[string, string]> = [
  ['auth', 'Sesión: login con correo o DNI, perfil y cierre'],
  ['users', 'Directorio y mantenedor de usuarios'],
  ['catalogs', 'Turnos, sabores, líneas, productos, velocidades y causas'],
  ['orders', 'Órdenes de fabricación, cierre, validación y bitácora RF12'],
  ['downtimes', 'Paradas y detecciones IoT'],
  ['scrap', 'Mermas MP · EP · PT'],
  ['speeds', 'Registros de velocidad y desvío vs estándar'],
  ['realtime', 'Tablero de tiempo real, modo TV y SSE'],
  ['reports', 'Indicadores, paradas, mermas y exportaciones'],
  ['alerts', 'Alertas predictivas y umbrales'],
  ['analytics', 'Modelo CRISP-DM, patrones y predicciones'],
  ['evidence', 'KPI de la tesis (TRI · TCI · TSP · CFS · EP)'],
];

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(crearValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  app.enableCors({
    origin: toList(config.get('CORS_ORIGIN', { infer: true })),
    credentials: true,
  });

  const documento = SwaggerModule.createDocument(
    app,
    TAGS.reduce(
      (builder, [nombre, descripcion]) => builder.addTag(nombre, descripcion),
      new DocumentBuilder()
        .setTitle('MES Yamboly API')
        .setDescription(
          'API del sistema MES de Yamboly. Colecciones `{ data, meta }`, errores `{ statusCode, code, message, details? }`.',
        )
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }),
    ).build(),
  );
  const rutaDocs = config.get('SWAGGER_PATH', { infer: true });
  SwaggerModule.setup(rutaDocs, app, documento, {
    swaggerOptions: { persistAuthorization: true },
  });

  const puerto = config.get('PORT', { infer: true });
  await app.listen(puerto);
  new Logger('Bootstrap').log(
    `MES Yamboly API en http://localhost:${puerto}/api/v1 · Swagger en /${rutaDocs}`,
  );
}

void bootstrap();
