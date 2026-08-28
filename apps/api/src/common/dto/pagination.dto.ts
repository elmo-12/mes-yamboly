import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Página solicitada (1-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero' })
  @Min(1, { message: 'page debe ser 1 o mayor' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25, description: 'Filas por página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize debe ser un entero' })
  @Min(1, { message: 'pageSize debe ser 1 o mayor' })
  @Max(100, { message: 'pageSize no puede superar 100' })
  pageSize: number = 25;
}
