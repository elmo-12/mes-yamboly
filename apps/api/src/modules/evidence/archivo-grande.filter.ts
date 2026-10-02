import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@mes/types';

/**
 * Multer rechaza un archivo > 5 MB con `PayloadTooLargeException('File too
 * large')`, que el filtro global devolvía como `INTERNAL_ERROR` y en inglés.
 * Aquí se traduce a un 413 con el mismo formato `{ statusCode, code, message,
 * details }` y el mensaje en español.
 */
@Catch(PayloadTooLargeException)
export class ArchivoDemasiadoGrandeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const cuerpo: ApiError = {
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      code: 'VALIDATION_ERROR',
      message: 'El archivo supera el tamaño máximo',
      details: { archivo: 'El archivo supera los 5 MB. Divide la exportación por periodos.' },
    };
    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json(cuerpo);
  }
}
