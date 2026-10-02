import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/** Recorta espacios en los textos: `'   '` deja de pasar `MinLength`. */
export const Recortar = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** `'true'`/`'false'` de query o form → booleano. */
export const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/**
 * Campo `version` de toda edición de catálogo: la versión que el cliente leyó.
 * Si no coincide con la vigente, la API responde 409 (concurrencia optimista).
 * Es opcional para no romper a clientes que aún no la envían.
 */
export class ConVersionDto {
  @ApiPropertyOptional({ example: 3, description: 'Versión leída (409 si cambió)' })
  @IsOptional()
  @IsInt({ message: 'version debe ser un entero' })
  @Min(1, { message: 'version debe ser 1 o mayor' })
  version?: number;
}
