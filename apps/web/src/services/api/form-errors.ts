import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from './client';

/**
 * Traduce un 422 `VALIDATION_ERROR` a errores de campo de react-hook-form.
 *
 * El contrato devuelve `details: { campo: 'mensaje' }` (mismo formato en los
 * mocks msw y en el `ValidationPipe` de NestJS), así que cada clave se asigna
 * al campo homónimo del formulario. Devuelve los campos que sí pudo mapear:
 * si está vacío, la vista debe caer al toast genérico.
 */
export function aplicarErroresApi<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  camposValidos?: readonly Path<T>[],
): Path<T>[] {
  if (!(error instanceof ApiClientError) || error.statusCode !== 422 || !error.details) return [];

  const aplicados: Path<T>[] = [];
  for (const [campo, mensaje] of Object.entries(error.details)) {
    if (typeof mensaje !== 'string') continue;
    const nombre = campo as Path<T>;
    if (camposValidos && !camposValidos.includes(nombre)) continue;
    setError(nombre, { type: 'server', message: mensaje });
    aplicados.push(nombre);
  }
  return aplicados;
}

/** Mensaje legible de cualquier error de red o de API, para el toast. */
export function mensajeDeError(error: unknown, porDefecto: string): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return porDefecto;
}
