import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/**
 * Normaliza la salida de los controladores:
 * - un arreglo suelto se envuelve en `{ data }` (colecciones no paginadas);
 * - `{ data, meta }` y los recursos simples se devuelven tal cual.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((cuerpo: unknown) => (Array.isArray(cuerpo) ? { data: cuerpo } : cuerpo)));
  }
}
