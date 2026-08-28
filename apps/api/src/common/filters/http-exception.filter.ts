import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@mes/types';

const CODIGO_POR_ESTADO: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

interface CuerpoExcepcion {
  code?: string;
  message?: string | string[];
  details?: Record<string, unknown>;
  error?: string;
}

/** Traduce cualquier excepción a `{ statusCode, code, message, details? }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Error interno del servidor';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = CODIGO_POR_ESTADO[statusCode] ?? 'INTERNAL_ERROR';
      const cuerpo = exception.getResponse();

      if (typeof cuerpo === 'string') {
        message = cuerpo;
      } else if (cuerpo && typeof cuerpo === 'object') {
        const { code: codigoCuerpo, message: mensaje, details: detalles } = cuerpo as CuerpoExcepcion;
        if (codigoCuerpo) code = codigoCuerpo;
        if (detalles) details = detalles;
        if (Array.isArray(mensaje)) {
          message = 'Revisa los campos del formulario';
          details = details ?? { errores: mensaje };
        } else if (typeof mensaje === 'string') {
          message = mensaje;
        }
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const cuerpo: ApiError = details
      ? { statusCode, code, message, details }
      : { statusCode, code, message };
    response.status(statusCode).json(cuerpo);
  }
}
