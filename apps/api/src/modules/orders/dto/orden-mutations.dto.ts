import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LOTE_MAX, OPERARIOS_MAX, TIEMPO_REGISTRO_MAX_SEG, UNIDADES_MAX } from '@mes/types';

/**
 * Entero obligatorio: `''`, `null` o espacios quedan `undefined` (→ 422
 * «Campo obligatorio») en vez de convertirse en 0 como hacía `@Type(() => Number)`.
 */
const aEntero = ({ value }: { value: unknown }): unknown => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? undefined : Number(t);
  }
  return value;
};

/*
 * Orden de los validadores: class-validator ejecuta de **abajo arriba** y el
 * pipe muestra el primer mensaje, así que el más específico va al final del
 * bloque: obligatorio → tipo → rango (y obligatorio → tipo → longitud).
 */

const recortar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Alta desde una orden SAP pendiente: línea, producto, número, planificado y
 * velocidad los deriva el servidor de la fila SAP; el turno es el de la hora
 * real de inicio.
 */
export class CreateOrdenDto {
  @ApiProperty({
    example: 'SAP-48211',
    description: 'Fila de orden SAP pendiente (`GET /ordenes-sap`)',
  })
  @IsString({ message: 'Selecciona una orden SAP' })
  @IsNotEmpty({ message: 'Selecciona una orden SAP' })
  ordenSapId!: string;

  @ApiProperty({ example: 'L-260828-02', maxLength: LOTE_MAX })
  @Transform(recortar)
  @MaxLength(LOTE_MAX, { message: `Máximo ${LOTE_MAX} caracteres` })
  @MinLength(3, { message: 'El lote es obligatorio (mínimo 3 caracteres)' })
  @IsString({ message: 'El lote debe ser texto' })
  @IsNotEmpty({ message: 'El lote es obligatorio' })
  lote!: string;

  @ApiProperty({
    example: '2027-02-28',
    description: 'Fecha real posterior a hoy (hora de planta)',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida' })
  vencimiento!: string;

  @ApiProperty({ example: 'USR-02', description: 'Usuario con rol maquinista' })
  @IsString({ message: 'Selecciona un maquinista' })
  @IsNotEmpty({ message: 'Selecciona un maquinista' })
  maquinistaId!: string;

  @ApiProperty({ example: 'USR-03', description: 'Usuario con rol supervisor o jefe' })
  @IsString({ message: 'Selecciona un supervisor' })
  @IsNotEmpty({ message: 'Selecciona un supervisor' })
  supervisorId!: string;

  @ApiProperty({ example: 6, minimum: 1, maximum: OPERARIOS_MAX })
  @Transform(aEntero)
  @Max(OPERARIOS_MAX, { message: `Máximo ${OPERARIOS_MAX} operarios` })
  @Min(1, { message: 'Debe haber al menos 1 operario' })
  @IsInt({ message: 'Debe ser un número entero' })
  @IsDefined({ message: 'Campo obligatorio' })
  operarios!: number;

  @ApiPropertyOptional({ type: [String], example: ['COL-01', 'COL-02'] })
  @IsOptional()
  @ArrayMaxSize(50, { message: 'Máximo 50 colaboradores' })
  @IsString({ each: true, message: 'Cada colaborador debe ser un id de texto' })
  @IsArray({ message: 'Debe ser una lista de colaboradores' })
  colaboradorIds?: string[];

  @ApiPropertyOptional({
    description: 'Segundos de registro — alimenta el KPI TRI',
    default: 0,
    maximum: TIEMPO_REGISTRO_MAX_SEG,
  })
  @IsOptional()
  @Type(() => Number)
  @Max(TIEMPO_REGISTRO_MAX_SEG, { message: `Máximo ${TIEMPO_REGISTRO_MAX_SEG} s` })
  @Min(0, { message: 'Debe ser 0 o mayor' })
  @IsInt({ message: 'Debe ser un número entero' })
  tiempoRegistroSeg?: number;
}

export class FinalizeOrdenDto {
  @ApiProperty({ example: 9840, minimum: 0, maximum: UNIDADES_MAX })
  @Transform(aEntero)
  @Max(UNIDADES_MAX, { message: 'Cantidad fuera de rango' })
  @Min(0, { message: 'Debe ser 0 o mayor' })
  @IsInt({ message: 'Debe ser un número entero' })
  @IsDefined({ message: 'Campo obligatorio' })
  producido!: number;

  @ApiProperty({ example: 9653, minimum: 0, maximum: UNIDADES_MAX })
  @Transform(aEntero)
  @Max(UNIDADES_MAX, { message: 'Cantidad fuera de rango' })
  @Min(0, { message: 'Debe ser 0 o mayor' })
  @IsInt({ message: 'Debe ser un número entero' })
  @IsDefined({ message: 'Campo obligatorio' })
  conteoCodificadora!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  @IsString({ message: 'Debe ser texto' })
  evidenciaUrl?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @MaxLength(500, { message: 'Máximo 500 caracteres' })
  @IsString({ message: 'Debe ser texto' })
  comentario?: string;

  @ApiPropertyOptional({
    description: 'Segundos de registro — alimenta el KPI TRI',
    default: 0,
    maximum: TIEMPO_REGISTRO_MAX_SEG,
  })
  @IsOptional()
  @Type(() => Number)
  @Max(TIEMPO_REGISTRO_MAX_SEG, { message: `Máximo ${TIEMPO_REGISTRO_MAX_SEG} s` })
  @Min(0, { message: 'Debe ser 0 o mayor' })
  @IsInt({ message: 'Debe ser un número entero' })
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
  @MaxLength(500, { message: 'Máximo 500 caracteres' })
  @IsString({ message: 'Debe ser texto' })
  observacion?: string;
}
