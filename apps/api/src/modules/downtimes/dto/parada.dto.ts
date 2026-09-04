import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ORIGENES_PARADA, type OrigenParada } from '@mes/types';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateParadaDto {
  @ApiProperty({ example: 'ORD-0815' })
  @IsString()
  @IsNotEmpty({ message: 'Orden requerida' })
  ordenId!: string;

  @ApiProperty({ example: 'LIN-LLEN-M2' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiProperty({ example: 'MAQ-04' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una máquina' })
  maquinaId!: string;

  @ApiPropertyOptional({ example: 'CPA-PN-02', description: 'Se deduce de la causa si se omite' })
  @IsOptional()
  @IsString()
  tipoCausaId?: string;

  @ApiProperty({ example: 'CPA-PN-02-01' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona la causa específica' })
  causaId!: string;

  @ApiProperty({ example: '2026-08-28T11:18:00' })
  @IsString()
  @IsNotEmpty({ message: 'La hora de inicio es obligatoria' })
  inicio!: string;

  @ApiProperty({ example: 'Se reemplazó cadena y se reajustó tensión', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'Describe la acción tomada (mínimo 10 caracteres)' })
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  accionTomada!: string;

  @ApiPropertyOptional({ example: 'SM-2026-0421' })
  @IsOptional()
  @IsString()
  numeroSolicitud?: string;

  @ApiPropertyOptional({ example: '/mock/evidencias/par.jpg' })
  @IsOptional()
  @IsString()
  evidenciaUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  afectaOee?: boolean;

  @ApiProperty({ example: 'USR-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un responsable' })
  responsableId!: string;

  @ApiPropertyOptional({ enum: ORIGENES_PARADA, default: 'manual' })
  @IsOptional()
  @IsIn(ORIGENES_PARADA)
  origen?: OrigenParada;

  @ApiPropertyOptional({ example: 'IOT-0815-01' })
  @IsOptional()
  @IsString()
  deteccionId?: string;

  @ApiPropertyOptional({ default: 0, description: 'Segundos de registro — KPI TRI' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tiempoRegistroSeg?: number;
}

export class UpdateParadaDto extends PartialType(CreateParadaDto) {
  @ApiPropertyOptional({
    example: '2026-08-28T11:27:00',
    nullable: true,
    description: 'Corrección de la hora de fin desde el drawer «Editar parada» (spec 05.F)',
  })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsString()
  @IsNotEmpty({ message: 'La hora de fin no puede quedar vacía' })
  fin?: string | null;

  @ApiPropertyOptional({ maxLength: 300, description: 'Se escribe en la bitácora' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoEdicion?: string;
}

export class FinalizeParadaDto {
  @ApiProperty({ example: '2026-08-28T11:27:00' })
  @IsString()
  @IsNotEmpty({ message: 'La hora de fin es obligatoria' })
  fin!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  comentarioCierre?: string;
}

export class ParadaQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'ORD-0815' })
  @IsOptional()
  @IsString()
  ordenId?: string;

  @ApiPropertyOptional({ description: 'Repetible o separado por comas' })
  @IsOptional()
  lineaId?: string | string[];

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

  @ApiPropertyOptional({ description: 'Sólo paradas sin hora de fin' })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  abiertas?: boolean;
}

export class ConfirmarDeteccionDto {
  @ApiProperty({ example: 'CPA-PN-02-01' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una causa' })
  causaId!: string;

  @ApiProperty({ example: 'MAQ-06' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una máquina' })
  maquinaId!: string;

  @ApiProperty({ minLength: 10, example: 'Se retiró el material atascado y se limpió la mordaza' })
  @IsString()
  @MinLength(10, { message: 'Describe la acción tomada' })
  @MaxLength(300)
  accionTomada!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tiempoRegistroSeg?: number;
}
