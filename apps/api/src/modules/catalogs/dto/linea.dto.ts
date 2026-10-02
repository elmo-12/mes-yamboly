import { ApiProperty, ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CAPACIDAD_LINEA_MAX,
  ESTADOS_CATALOGO,
  TIPOS_PROCESO_LINEA,
  type EstadoCatalogo,
  type TipoProcesoLinea,
} from '@mes/types';
import { ConVersionDto, Recortar } from './comunes.dto';

/** Alta de línea (`POST /lineas`). La línea es la máquina física de planta. */
export class CreateLineaDto {
  @ApiProperty({
    example: 'LLEN-M2',
    description: 'Formato LLEN-M2, EXTR-2 o MOLD-A3. Inmutable tras el alta (define el id).',
  })
  @Recortar()
  @IsString()
  @Matches(/^[A-Z]{3,4}-[A-Z]?\d{1,2}$/, {
    message: 'Formato esperado LLEN-M2, EXTR-2 o MOLD-A3',
  })
  codigo!: string;

  @ApiProperty({ example: 'Llenadora M2' })
  @Recortar()
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ example: 'LLEN M2' })
  @Recortar()
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

  /** `null` ya no se cuela por `@IsOptional` (antes terminaba en 500 al guardar). */
  @ApiPropertyOptional({ example: 133.3, description: 'Unidades por minuto nominales' })
  @ValidateIf((_, valor) => valor !== undefined)
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'La capacidad debe ser numérica' },
  )
  @Min(0, { message: 'Debe ser 0 o mayor' })
  @Max(CAPACIDAD_LINEA_MAX, { message: `Máximo ${CAPACIDAD_LINEA_MAX} u/min` })
  capacidadUnidadesMin?: number;
}

/**
 * Edición parcial (`PATCH /lineas/:id`). `codigo` se acepta sólo si no cambia
 * (422 si cambia): el id `LIN-<codigo>` lo referencian órdenes y paradas.
 */
export class UpdateLineaDto extends IntersectionType(PartialType(CreateLineaDto), ConVersionDto) {}
