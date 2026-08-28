import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { crearValidationPipe } from '../src/common/pipes/validation.pipe';

/** Levanta la app con la misma configuración global que `main.ts`. */
export async function crearApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(crearValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.init();
  return app;
}

export const CREDENCIALES = {
  jefe: { email: 'jefe@yamboly.lat', password: 'Yamboly2026' },
  maquinista: { email: 'jorge.quispe@yamboly.lat', password: 'Yamboly2026' },
};

export async function login(
  app: INestApplication,
  credenciales = CREDENCIALES.jefe,
): Promise<string> {
  const respuesta = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send(credenciales)
    .expect(200);
  return (respuesta.body as { accessToken: string }).accessToken;
}
