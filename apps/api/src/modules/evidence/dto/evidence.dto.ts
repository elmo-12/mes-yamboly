import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FORMATOS_EXPORT, KPIS_TESIS, type FormatoExport, type KpiTesisId } from '@mes/types';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

/* --- Anexo 02 · carga del pretest -------------------------------- */

export class RegistroPretestDto {
  @ApiProperty({ example: '2026-08-25' })
  @Matches(FECHA, { message: 'Fecha inválida' })
  fecha!: string;

  @ApiProperty({ example: 'Parada PN-02-01 · Llenadora M2' })
  @IsString()
  @MinLength(3, { message: 'Describe el evento' })
  eventoRegistrado!: string;

  @ApiProperty({ example: '07:45:00' })
  @Matches(HORA, { message: 'Hora inválida' })
  horaInicioRegistro!: string;

  @ApiProperty({ example: 2.8, description: 'Minutos con un decimal' })
  @Type(() => Number)
  @Min(0.1, { message: 'Debe ser mayor que 0' })
  tiempoMin!: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacion?: string;
}

export class CargarPretestDto {
  @ApiProperty({ type: [RegistroPretestDto] })
  @IsArray({ message: 'registros debe ser una lista' })
  @ArrayMinSize(1, { message: 'Carga al menos un registro' })
  @ValidateNested({ each: true })
  @Type(() => RegistroPretestDto)
  registros!: RegistroPretestDto[];
}

/* --- Anexo 03 · override manual de criterios TCI ------------------ */

export class OverrideTciDto {
  @ApiPropertyOptional({ description: 'Fuerza el criterio «completo»; `null` vuelve a la regla' })
  @IsOptional()
  @IsBoolean({ message: 'completo debe ser booleano' })
  completo?: boolean | null;

  @ApiPropertyOptional({ description: 'Fuerza el criterio «preciso»' })
  @IsOptional()
  @IsBoolean({ message: 'preciso debe ser booleano' })
  preciso?: boolean | null;

  @ApiPropertyOptional({ description: 'Fuerza el criterio «trazable»' })
  @IsOptional()
  @IsBoolean({ message: 'trazable debe ser booleano' })
  trazable?: boolean | null;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  observacion?: string;
}

/* --- Anexo 05 · lista de cotejo CFS ------------------------------- */

export class VerificacionCfsDto {
  @ApiProperty()
  @IsBoolean({ message: 'cumple debe ser booleano' })
  cumple!: boolean;

  @ApiPropertyOptional({ maxLength: 300, default: '' })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  observacion: string = '';
}

/* --- Encuesta pública (Anexo 04) ---------------------------------- */

export class EncuestaRespuestaDto {
  @ApiProperty({ type: [Number], example: [5, 4, 4, 5, 4, 4, 5, 4], description: '8 valores Likert 1–5' })
  @IsArray({ message: 'respuestas debe ser una lista' })
  @ArrayMinSize(8, { message: 'Responde los 8 ítems' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Responde de 1 a 5' })
  @Min(1, { each: true, message: 'Responde de 1 a 5' })
  @Max(5, { each: true, message: 'Responde de 1 a 5' })
  respuestas!: number[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Máximo 500 caracteres' })
  comentario?: string;
}

/* --- Exportación de evidencia ------------------------------------- */

export class ExportEvidenciaDto {
  @ApiProperty({ isArray: true, enum: KPIS_TESIS, example: ['TRI', 'TCI'] })
  @IsArray({ message: 'kpis debe ser una lista' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un instrumento' })
  @IsIn(KPIS_TESIS, { each: true, message: 'Instrumento no reconocido' })
  kpis!: KpiTesisId[];

  @ApiPropertyOptional({ enum: FORMATOS_EXPORT, default: 'xlsx' })
  @IsOptional()
  @IsIn(FORMATOS_EXPORT, { message: 'formato no reconocido' })
  formato: FormatoExport = 'xlsx';

  @ApiPropertyOptional({ enum: ['spss', 'informe'], default: 'spss' })
  @IsOptional()
  @IsIn(['spss', 'informe'], { message: 'destino debe ser spss o informe' })
  destino: 'spss' | 'informe' = 'spss';
}
