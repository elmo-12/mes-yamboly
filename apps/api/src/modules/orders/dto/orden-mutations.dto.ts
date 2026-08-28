import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TURNOS, type Turno } from '@mes/types';

export class CreateOrdenDto {
  @ApiProperty({ example: 'OF-2026-0816' })
  @Matches(/^OF-\d{4}-\d{4}$/, { message: 'Formato esperado OF-2026-0815' })
  codigo!: string;

  @ApiProperty({ example: 'LIN-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona una línea' })
  lineaId!: string;

  @ApiProperty({ example: 'PRD-003' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un producto' })
  productoId!: string;

  @ApiProperty({ example: 'L-260828-02' })
  @IsString()
  @MinLength(3, { message: 'El lote es obligatorio' })
  lote!: string;

  @ApiProperty({ example: '2027-02-28' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida' })
  vencimiento!: string;

  @ApiProperty({ enum: TURNOS, example: 'M' })
  @IsIn(TURNOS)
  turno!: Turno;

  @ApiProperty({ example: 10000, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Debe ser mayor que 0' })
  planificado!: number;

  @ApiProperty({ example: 'USR-02' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un maquinista' })
  maquinistaId!: string;

  @ApiProperty({ example: 'USR-03' })
  @IsString()
  @IsNotEmpty({ message: 'Selecciona un supervisor' })
  supervisorId!: string;

  @ApiProperty({ example: 6, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Debe haber al menos 1 operario' })
  operarios!: number;

  @ApiPropertyOptional({ type: [String], example: ['COL-01', 'COL-02'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colaboradorIds?: string[];
}

export class FinalizeOrdenDto {
  @ApiProperty({ example: 9840, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Debe ser 0 o mayor' })
  producido!: number;

  @ApiProperty({ example: 9653, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Debe ser 0 o mayor' })
  conteoCodificadora!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenciaUrl?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Máximo 500 caracteres' })
  comentario?: string;

  @ApiPropertyOptional({ description: 'Segundos de registro — alimenta el KPI TRI', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  tiempoRegistroSeg?: number;
}

/** Checklist de validación: los cuatro puntos deben confirmarse. */
export class ValidateOrdenDto {
  @ApiProperty({ example: true })
  @Equals(true, { message: 'Confirma la producción registrada' })
  produccionRegistrada!: boolean;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Confirma que las paradas tienen causa y acción' })
  paradasConCausa!: boolean;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Confirma que las mermas están clasificadas' })
  mermasClasificadas!: boolean;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Confirma la evidencia de etiqueta' })
  evidenciaEtiqueta!: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}
