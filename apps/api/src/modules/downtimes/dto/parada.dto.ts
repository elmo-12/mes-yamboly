import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  Max,
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
import { ORIGENES_PARADA, TIEMPO_REGISTRO_MAX_SEG, type OrigenParada } from '@mes/types';
import { ISO_LOCAL_REGEX, MENSAJE_ISO_LOCAL } from '../../../common/utils/fechas';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/** Recorta espacios: un texto solo de espacios cuenta como vacío. */
const RECORTAR = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateParadaDto {
  @ApiProperty({ example: 'ORD-0815' })
  @IsString()
  @IsNotEmpty({ message: 'Orden requerida' })
  ordenId!: string;

  @ApiProperty({ example: 'LIN-LLEN-M2' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiPropertyOptional({ example: 'CPA-PN-02', description: 'Se deduce de la causa si se omite' })
  @IsOptional()
  @IsString()
  tipoCausaId?: string;

  @ApiProperty({ example: 'CPA-PN-02-01' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona la causa específica' })
  causaId!: string;

  @ApiProperty({ example: '2026-08-28T11:18:00', description: 'ISO local de Lima, sin zona' })
  @IsString()
  @IsNotEmpty({ message: 'La hora de inicio es obligatoria' })
  @Matches(ISO_LOCAL_REGEX, { message: MENSAJE_ISO_LOCAL })
  inicio!: string;

  @ApiPropertyOptional({
    example: '2026-08-28T11:30:00',
    description: 'Parada retroactiva ya cerrada: se crea con su hora de fin',
  })
  @IsOptional()
  @IsString()
  @Matches(ISO_LOCAL_REGEX, { message: MENSAJE_ISO_LOCAL })
  fin?: string;

  @ApiProperty({ example: 'Se reemplazó cadena y se reajustó tensión', minLength: 10 })
  @Transform(RECORTAR)
  @IsString()
  @MinLength(10, { message: 'Describe la acción tomada (mínimo 10 caracteres)' })
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  accionTomada!: string;

  @ApiPropertyOptional({ example: 'SM-2026-0421', maxLength: 50 })
  @IsOptional()
  @Transform(RECORTAR)
  @IsString()
  @MaxLength(50, { message: 'Máximo 50 caracteres' })
  numeroSolicitud?: string;

  @ApiPropertyOptional({ example: '/api/v1/evidencias/EV-20260911-a1b2c3d4.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Máximo 200 caracteres' })
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

export class UpdateParadaDto extends PartialType(OmitType(CreateParadaDto, ['fin'] as const)) {
  @ApiPropertyOptional({
    example: '2026-08-28T11:27:00',
    nullable: true,
    description: 'Corrección de la hora de fin desde el drawer «Editar parada» (spec 05.F)',
  })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsString()
  @IsNotEmpty({ message: 'La hora de fin no puede quedar vacía' })
  @Matches(ISO_LOCAL_REGEX, { message: MENSAJE_ISO_LOCAL })
  fin?: string | null;

  @ApiPropertyOptional({ maxLength: 300, description: 'Se escribe en la bitácora' })
  @IsOptional()
  @Transform(RECORTAR)
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  motivoEdicion?: string;
}

export class FinalizeParadaDto {
  @ApiProperty({ example: '2026-08-28T11:27:00' })
  @IsString()
  @IsNotEmpty({ message: 'La hora de fin es obligatoria' })
  @Matches(ISO_LOCAL_REGEX, { message: MENSAJE_ISO_LOCAL })
  fin!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(RECORTAR)
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

  @ApiProperty({ minLength: 10, example: 'Se retiró el material atascado y se limpió la mordaza' })
  @Transform(RECORTAR)
  @IsString()
  @MinLength(10, { message: 'Describe la acción tomada (mínimo 10 caracteres)' })
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  accionTomada!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(RECORTAR)
  @IsString()
  @MaxLength(50, { message: 'Máximo 50 caracteres' })
  numeroSolicitud?: string;

  @ApiPropertyOptional({ description: 'URL devuelta por POST /evidencias' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Máximo 200 caracteres' })
  evidenciaUrl?: string;

  @ApiPropertyOptional({ default: 0, maximum: TIEMPO_REGISTRO_MAX_SEG })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tiempo de registro debe ser un número entero de segundos' })
  @Min(0, { message: 'El tiempo de registro no puede ser negativo' })
  @Max(TIEMPO_REGISTRO_MAX_SEG, {
    message: `El tiempo de registro no puede superar ${TIEMPO_REGISTRO_MAX_SEG} s`,
  })
  tiempoRegistroSeg?: number;
}
