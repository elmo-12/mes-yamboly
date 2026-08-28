import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ESTADOS_CATALOGO, type EstadoCatalogo } from '@mes/types';

/** Configuración → Productos y velocidades: sólo la velocidad estándar y el estado. */
export class UpdateProductoDto {
  @ApiPropertyOptional({ example: 42, minimum: 1, maximum: 1000, description: 'Unidades por minuto' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe estar entre 1 y 1 000 u/min' })
  @Min(1, { message: 'Debe estar entre 1 y 1 000 u/min' })
  @Max(1000, { message: 'Debe estar entre 1 y 1 000 u/min' })
  velocidadEstandar?: number;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}
