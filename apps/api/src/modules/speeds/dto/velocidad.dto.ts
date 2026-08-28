import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

  @ApiProperty({ example: 'LIN-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiProperty({ example: 118, minimum: 0.1, maximum: 1000, description: 'Unidades por minuto' })
  @Type(() => Number)
  @IsNumber({}, { message: 'La velocidad debe ser numérica' })
  @IsPositive({ message: 'La velocidad debe ser mayor que 0' })
  @Max(1000, { message: 'Velocidad fuera de rango' })
  velocidadReal!: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Máximo 200 caracteres' })
  motivo?: string;

  @ApiProperty({ example: 'USR-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un responsable' })
  responsableId!: string;

  @ApiPropertyOptional({ default: 0, description: 'Segundos de registro — KPI TRI' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
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
