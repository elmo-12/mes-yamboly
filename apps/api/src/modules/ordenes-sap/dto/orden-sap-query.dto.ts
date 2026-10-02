import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class OrdenSapQueryDto {
  @ApiPropertyOptional({ description: 'Línea del MES', example: 'LIN-MOLD-A4' })
  @IsOptional()
  @IsString()
  lineaId?: string;

  @ApiPropertyOptional({
    description: 'Busca por número de orden, código o descripción del producto',
    example: '95101752',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
