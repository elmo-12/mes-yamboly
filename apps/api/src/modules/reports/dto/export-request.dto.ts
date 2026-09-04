import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { DATASETS_EXPORT, FORMATOS_EXPORT, type DatasetExport, type FormatoExport } from '@mes/types';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ExportRequestDto {
  @ApiProperty({ isArray: true, enum: DATASETS_EXPORT, example: ['ordenes', 'paradas'] })
  @IsArray({ message: 'datasets debe ser una lista' })
  @ArrayMinSize(1, { message: 'Selecciona al menos un dataset' })
  @IsIn(DATASETS_EXPORT, { each: true, message: 'dataset no reconocido' })
  datasets!: DatasetExport[];

  @ApiPropertyOptional({ enum: FORMATOS_EXPORT, default: 'xlsx' })
  @IsOptional()
  @IsIn(FORMATOS_EXPORT, { message: 'formato no reconocido' })
  formato: FormatoExport = 'xlsx';

  @ApiProperty({ example: '2026-08-22' })
  @Matches(FECHA, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde!: string;

  @ApiProperty({ example: '2026-08-28' })
  @Matches(FECHA, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta!: string;

  @ApiPropertyOptional({ example: 'LIN-LLEN-M2' })
  @IsOptional()
  @IsString()
  lineaId?: string;
}
