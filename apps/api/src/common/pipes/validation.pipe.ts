import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { ValidationException } from '../exceptions/business.exception';

/**
 * Aplana los errores de class-validator a `details: { campo: 'mensaje' }`,
 * la misma forma que devuelven los mocks msw y que consumen los formularios
 * (react-hook-form + zod) para pintar el error bajo cada campo.
 */
export function detallesPorCampo(errores: ValidationError[], prefijo = ''): Record<string, string> {
  const detalles: Record<string, string> = {};
  for (const error of errores) {
    const ruta = prefijo ? `${prefijo}.${error.property}` : error.property;
    const mensajes = error.constraints ? Object.values(error.constraints) : [];
    if (mensajes.length > 0) detalles[ruta] = mensajes[0] as string;
    if (error.children && error.children.length > 0) {
      Object.assign(detalles, detallesPorCampo(error.children, ruta));
    }
  }
  return detalles;
}

/**
 * Pipe global del proyecto. El contrato fija **422 `VALIDATION_ERROR`** para la
 * validación de cuerpo/query (no el 400 por defecto de Nest) y `details` por campo.
 */
export function crearValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
    transformOptions: { enableImplicitConversion: false },
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    exceptionFactory: (errores: ValidationError[]) =>
      new ValidationException(detallesPorCampo(errores)),
  });
}
