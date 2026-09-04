import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { ESTADOS_CATALOGO, type EstadoCatalogo } from '@mes/types';

/**
 * Alta de producto (`POST /productos`) — espejo de `productoSchema`.
 * El producto ya no lleva `lineaId` ni `velocidadEstandar`: la velocidad vive
 * en el par producto × línea (`POST /velocidades-estandar`).
 */
export class CreateProductoDto {
  @ApiProperty({ example: '1110001', description: 'Código de 7 dígitos del maestro' })
  @IsString()
  @Matches(/^\d{7}$/, { message: 'Formato esperado 1110001 (7 dígitos)' })
  codigo!: string;

  @ApiProperty({ example: 'CUBETA YAMBOLY HELADO CREMA CAPUCCINO 1 X 5 L' })
  @IsString()
  @MinLength(3, { message: 'La descripción larga es obligatoria' })
  descripcionLarga!: string;

  @ApiProperty({ example: 'CUB-YAM-CAPUCCINO 1X5L' })
  @IsString()
  @MinLength(3, { message: 'La descripción corta es obligatoria' })
  descripcionCorta!: string;

  @ApiProperty({ example: 'CUB-YAM-CAPUCCINO 1X5L', description: 'Nombre mostrado en la UI' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  @IsOptional()
  @IsString()
  alias?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'YAMBOLY' })
  @IsOptional()
  @IsString()
  marca?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2.54 kg(5L)' })
  @IsOptional()
  @IsString()
  presentacion?: string | null;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Debe ser 1 o mayor' })
  @Min(1, { message: 'Debe ser 1 o mayor' })
  unidadesPorCaja?: number;

  @ApiProperty({ example: 2.54, description: 'Peso neto por unidad en kilogramos' })
  @Type(() => Number)
  @IsNumber({}, { message: 'El peso debe ser numérico' })
  @IsPositive({ message: 'El peso debe ser mayor que 0' })
  pesoKg!: number;

  @ApiPropertyOptional({ nullable: true, example: 'SAB-2110124' })
  @IsOptional()
  @IsString()
  saborId?: string | null;

  @ApiPropertyOptional({ example: 'Capuccino', description: 'Texto informativo del maestro' })
  @IsOptional()
  @IsString()
  sabor?: string;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO, default: 'activo' })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}

/** Edición parcial (`PATCH /productos/:id`). */
export class UpdateProductoDto extends PartialType(CreateProductoDto) {}

export class ProductoQueryDto {
  @ApiPropertyOptional({
    example: 'LIN-LLEN-M2',
    description: 'Sólo productos con par producto × línea activo en esa línea',
  })
  @IsOptional()
  @IsString()
  lineaId?: string;

  @ApiPropertyOptional({ example: 'capuccino', description: 'Código, nombre o descripción' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;
}
