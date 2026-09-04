import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ESTADOS_CATALOGO, type EstadoCatalogo } from '@mes/types';

/**
 * Alta de par producto × línea (`POST /velocidades-estandar`) — espejo de
 * `velocidadEstandarSchema`. `velocidadUnidMin` no se envía: la API la deriva
 * de `velocidadUnidHora / 60` con 1 decimal.
 */
export class CreateVelocidadEstandarDto {
  @ApiProperty({ example: 'PRD-1110001' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un producto' })
  productoId!: string;

  @ApiProperty({ example: 'LIN-LLEN-M2' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiProperty({ example: 480, minimum: 1, maximum: 60000, description: 'Unidades por hora' })
  @Type(() => Number)
  @IsInt({ message: 'Debe ser un número entero' })
  @Min(1, { message: 'Debe ser mayor que 0' })
  @Max(60_000, { message: 'Velocidad fuera de rango' })
  velocidadUnidHora!: number;

  @ApiPropertyOptional({ example: 0.9, minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Debe ser numérico' })
  @Min(0, { message: 'Debe ser 0 o mayor' })
  @Max(100, { message: 'No puede superar 100 %' })
  mermaEstandarPct?: number;

  @ApiPropertyOptional({ example: 45, nullable: true, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Debe ser numérico' })
  @Min(0, { message: 'Debe ser 0 o mayor' })
  cipMin?: number | null;

  @ApiPropertyOptional({ example: 20, nullable: true, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Debe ser numérico' })
  @Min(0, { message: 'Debe ser 0 o mayor' })
  arranqueMin?: number | null;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO, default: 'activo' })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}

/** Edición parcial (`PATCH /velocidades-estandar/:id`). */
export class UpdateVelocidadEstandarDto extends PartialType(CreateVelocidadEstandarDto) {}

export class VelocidadEstandarQueryDto {
  @ApiPropertyOptional({ example: 'PRD-1110001' })
  @IsOptional()
  @IsString()
  productoId?: string;

  @ApiPropertyOptional({ example: 'LIN-LLEN-M2' })
  @IsOptional()
  @IsString()
  lineaId?: string;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}
