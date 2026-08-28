import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Forma única de error de la API. */
export class ApiErrorDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    example: 'NOT_FOUND',
    enum: [
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'BUSINESS_RULE',
      'INTERNAL_ERROR',
    ],
  })
  code!: string;

  @ApiProperty({ example: 'Orden de fabricación no encontrado' })
  message!: string;

  @ApiPropertyOptional({ type: Object, description: 'Detalle por campo cuando aplica' })
  details?: Record<string, unknown>;
}

/** Metadatos de paginación de las colecciones. */
export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 25 }) pageSize!: number;
  @ApiProperty({ example: 60 }) total!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
}
