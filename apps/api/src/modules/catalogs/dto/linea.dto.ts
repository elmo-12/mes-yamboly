import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import {
  ESTADOS_CATALOGO,
  TIPOS_PROCESO_LINEA,
  type EstadoCatalogo,
  type TipoProcesoLinea,
} from '@mes/types';

/** Alta de línea (`POST /lineas`). La línea es la máquina física de planta. */
export class CreateLineaDto {
  @ApiProperty({ example: 'LLEN-M2', description: 'Formato LLEN-M2, EXTR-2 o MOLD-A3' })
  @IsString()
  @Matches(/^[A-Z]{3,4}-[A-Z]?\d{1,2}$/, {
    message: 'Formato esperado LLEN-M2, EXTR-2 o MOLD-A3',
  })
  codigo!: string;

  @ApiProperty({ example: 'Llenadora M2' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ example: 'LLEN M2' })
  @IsString()
  @MinLength(2, { message: 'El nombre corto es obligatorio' })
  nombreCorto!: string;

  @ApiProperty({ enum: TIPOS_PROCESO_LINEA, example: 'llenadora' })
  @IsIn(TIPOS_PROCESO_LINEA, { message: 'Selecciona el tipo de proceso' })
  tipoProceso!: TipoProcesoLinea;

  @ApiPropertyOptional({ enum: ESTADOS_CATALOGO, default: 'activo' })
  @IsOptional()
  @IsIn(ESTADOS_CATALOGO)
  estado?: EstadoCatalogo;

  @ApiPropertyOptional({ example: 133.3, description: 'Unidades por minuto nominales' })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Debe ser 0 o mayor' })
  capacidadUnidadesMin?: number;
}

export class UpdateLineaDto extends PartialType(CreateLineaDto) {}
