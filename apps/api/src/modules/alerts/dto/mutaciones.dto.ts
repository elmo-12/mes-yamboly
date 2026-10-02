import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Recorta espacios antes de validar: «          x» ya no cuenta como 11 caracteres. */
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AtenderAlertaDto {
  @ApiProperty({ minLength: 10, maxLength: 300, example: 'Se detuvo la línea y se reemplazó la cadena' })
  @Transform(recortar)
  @IsString()
  @MinLength(10, { message: 'Describe la acción tomada (mínimo 10 caracteres)' })
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  accionTomada!: string;
}

export class DescartarAlertaDto {
  @ApiProperty({ minLength: 5, maxLength: 300, example: 'Falsa alarma: la línea estaba en cambio de formato' })
  @Transform(recortar)
  @IsString()
  @MinLength(5, { message: 'Indica el motivo del descarte' })
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  motivo!: string;
}

export class ConfirmarEventoDto {
  @ApiProperty({ description: '`true` si el evento previsto realmente ocurrió' })
  @IsBoolean({ message: 'Indica si el evento ocurrió' })
  ocurrio!: boolean;

  @ApiPropertyOptional({ maxLength: 300 })
  @Transform(recortar)
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Máximo 300 caracteres' })
  observacion?: string;
}

export class ConfirmacionLoteItemDto extends ConfirmarEventoDto {
  @ApiProperty({ example: 'ALE-018' })
  @IsString()
  @IsNotEmpty({ message: 'alertaId es obligatorio' })
  alertaId!: string;
}

export class ConfirmarLoteDto {
  @ApiProperty({ type: [ConfirmacionLoteItemDto] })
  @IsArray({ message: 'confirmaciones debe ser una lista' })
  @ArrayMinSize(1, { message: 'Confirma al menos una alerta' })
  @ArrayMaxSize(200, { message: 'Máximo 200 alertas por lote' })
  @ValidateNested({ each: true })
  @Type(() => ConfirmacionLoteItemDto)
  confirmaciones!: ConfirmacionLoteItemDto[];
}
