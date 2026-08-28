import { HttpException, HttpStatus } from '@nestjs/common';

/** 422 con `code: VALIDATION_ERROR` y detalle por campo. */
export class ValidationException extends HttpException {
  constructor(details: Record<string, unknown>, message = 'Revisa los campos del formulario') {
    super({ code: 'VALIDATION_ERROR', message, details }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** 409 — conflicto de estado o unicidad. */
export class ConflictoException extends HttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'CONFLICT', message, details }, HttpStatus.CONFLICT);
  }
}

/** 422 con `code: BUSINESS_RULE` — regla de negocio incumplida. */
export class BusinessRuleException extends HttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: 'BUSINESS_RULE', message, details }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** 404 homogéneo: «Orden de fabricación no encontrada». */
export class NoEncontradoException extends HttpException {
  constructor(recurso: string) {
    super({ code: 'NOT_FOUND', message: `${recurso} no encontrado` }, HttpStatus.NOT_FOUND);
  }
}
