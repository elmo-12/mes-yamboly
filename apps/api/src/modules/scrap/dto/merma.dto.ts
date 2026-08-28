import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TIPOS_MERMA, type TipoMermaCodigo } from '@mes/types';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateMermaDto {
  @ApiProperty({ example: 'ORD-0815' })
  @IsString()
  @IsNotEmpty({ message: 'Orden requerida' })
  ordenId!: string;

  @ApiProperty({ example: 'LIN-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiProperty({ enum: TIPOS_MERMA, example: 'EP' })
  @IsIn(TIPOS_MERMA, { message: 'Selecciona el tipo de merma' })
  tipo!: TipoMermaCodigo;

  @ApiProperty({ example: 3.2, minimum: 0.01, maximum: 500 })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser numérica' })
  @IsPositive({ message: 'La cantidad debe ser mayor que 0' })
  @Max(500, { message: 'Cantidad fuera de rango' })
  cantidadKg!: number;

  @ApiProperty({ example: 'Vainilla' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un sabor' })
  sabor!: string;

  @ApiProperty({ example: 'CME-MR-03' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una causa' })
  causaId!: string;

  @ApiProperty({ example: 'USR-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un responsable' })
  responsableId!: string;

  @ApiPropertyOptional({ example: 'BLD-2026-0417' })
  @IsOptional()
  @IsString()
  codigoBalde?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  enviarPasteurizacion?: boolean;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  observacion?: string;

  @ApiPropertyOptional({ default: 0, description: 'Segundos de registro — KPI TRI' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tiempoRegistroSeg?: number;
}

export class UpdateMermaDto extends PartialType(CreateMermaDto) {}

export class MermaQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'ORD-0815' })
  @IsOptional()
  @IsString()
  ordenId?: string;

  @ApiPropertyOptional({ description: 'Repetible o separado por comas' })
  @IsOptional()
  lineaId?: string | string[];

  @ApiPropertyOptional({ enum: TIPOS_MERMA, isArray: true })
  @IsOptional()
  tipo?: string | string[];

  @ApiPropertyOptional({ description: 'Repetible o separado por comas' })
  @IsOptional()
  causaId?: string | string[];

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-08-28' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;
}
