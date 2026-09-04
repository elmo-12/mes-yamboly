import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CLAVES_CRITERIO_TCI,
  FORMATOS_EXPORT,
  KPIS_TESIS,
  TIPOS_REGISTRO_TCI,
  type ClaveCriterioTci,
  type FormatoExport,
  type KpiTesisId,
  type TipoRegistroTci,
} from '@mes/types';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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

/* --- Anexo 03 · validación de calidad (TCI) ----------------------- */

export class ValidarTciDto {
  @ApiPropertyOptional({ example: '2026-08-28', description: 'Por defecto, el primer día con captura del postest' })
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-08-28', description: 'Por defecto, hoy' })
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;

  @ApiPropertyOptional({ isArray: true, enum: TIPOS_REGISTRO_TCI, description: 'Por defecto, los tres tipos' })
  @IsOptional()
  @IsArray({ message: 'tipos debe ser una lista' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un tipo' })
  @IsIn(TIPOS_REGISTRO_TCI, { each: true, message: 'Tipo de registro no reconocido' })
  tipos?: TipoRegistroTci[];
}

export class TciQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TIPOS_REGISTRO_TCI, isArray: true, description: 'Repetible o separado por comas' })
  @IsOptional()
  tipo?: TipoRegistroTci | TipoRegistroTci[];

  @ApiPropertyOptional({ enum: ['valido', 'invalido'] })
  @IsOptional()
  @IsIn(['valido', 'invalido'], { message: 'resultado debe ser valido o invalido' })
  resultado?: 'valido' | 'invalido';

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta?: string;
}

export class OverrideTciDto {
  @ApiPropertyOptional({
    example: { sensor: true, solicitud: null },
    description: 'Fuerza criterios por clave; `null` devuelve el criterio a la regla',
  })
  @IsOptional()
  @IsObject({ message: 'overrides debe ser un objeto' })
  overrides?: Partial<Record<ClaveCriterioTci, boolean | null>>;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  observacion?: string;
}

/** Claves de criterio admitidas por `PATCH /evidencia/tci/:id`. */
export const CLAVES_OVERRIDE: readonly ClaveCriterioTci[] = CLAVES_CRITERIO_TCI;

/* --- Anexo 04 · invitación a la encuesta -------------------------- */

export class CrearInvitacionDto {
  @ApiProperty({ example: 'Jorge Quispe' })
  @IsString({ message: 'Escribe el nombre del invitado' })
  @MinLength(3, { message: 'Escribe el nombre del invitado' })
  @MaxLength(80, { message: 'Máximo 80 caracteres' })
  invitado!: string;

  @ApiPropertyOptional({ example: 'Maquinista', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Máximo 60 caracteres' })
  rol?: string;
}

/* --- Fuentes externas · importación ------------------------------- */

export class ImportarFuenteDto {
  @ApiPropertyOptional({
    type: 'string',
    example: '{"fecha_hora":"Timestamp"}',
    description: 'JSON `{columnaEsperada: cabeceraDelArchivo}` para corregir columnas',
  })
  @IsOptional()
  @IsString({ message: 'mapeo debe ser un JSON en texto' })
  mapeo?: string;
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
