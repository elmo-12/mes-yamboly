import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { TIEMPO_REGISTRO_MAX_SEG } from '@mes/types';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateVelocidadDto {
  @ApiProperty({ example: 'ORD-0815' })
  @IsString()
  @IsNotEmpty({ message: 'Orden requerida' })
  ordenId!: string;

  @ApiProperty({ example: 'LIN-LLEN-M2' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiProperty({ example: 118, minimum: 0.1, maximum: 1000, description: 'Unidades por minuto' })
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'La velocidad debe ser numérica (máximo 2 decimales)' },
  )
  @IsPositive({ message: 'La velocidad debe ser mayor que 0' })
  @Max(1000, { message: 'Velocidad fuera de rango' })
  velocidadReal!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200, { message: 'Máximo 200 caracteres' })
  motivo?: string;

  @ApiProperty({ example: 'USR-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un responsable' })
  responsableId!: string;

  @ApiPropertyOptional({
    default: 0,
    maximum: TIEMPO_REGISTRO_MAX_SEG,
    description: 'Segundos de registro — KPI TRI',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tiempo de registro debe ser un número entero de segundos' })
  @Min(0, { message: 'El tiempo de registro no puede ser negativo' })
  @Max(TIEMPO_REGISTRO_MAX_SEG, {
    message: `El tiempo de registro no puede superar ${TIEMPO_REGISTRO_MAX_SEG} s`,
  })
  tiempoRegistroSeg?: number;
}

export class VelocidadQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'ORD-0815' })
  @IsOptional()
  @IsString()
  ordenId?: string;

  @ApiPropertyOptional({ description: 'Repetible o separado por comas' })
  @IsOptional()
  lineaId?: string | string[];
}
