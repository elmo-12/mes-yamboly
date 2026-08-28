import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { NIVELES_CAUSA, type NivelCausa } from '@mes/types';

const BOOLEANO = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateCausaParadaDto {
  @ApiProperty({ example: 'PM-01-06', description: 'PM-01, PM-01-A o PM-01-03' })
  @IsString()
  @Matches(/^P[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/, {
    message: 'Formato esperado PM-01, PM-01-A o PM-01-03',
  })
  codigo!: string;

  @ApiProperty({ example: 'Rotura de piñón' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ enum: NIVELES_CAUSA })
  @IsIn(NIVELES_CAUSA)
  nivel!: NivelCausa;

  @ApiPropertyOptional({ example: 'CPA-PM-01-A', nullable: true })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ enum: ['programada', 'imprevista'], default: 'imprevista' })
  @IsOptional()
  @IsIn(['programada', 'imprevista'])
  clasificacion?: 'programada' | 'imprevista';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  afectaOee?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  requiereEvidencia?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(BOOLEANO)
  @IsBoolean()
  requiereSolicitud?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Debe ser 0 o mayor' })
  tiempoEstandarMin?: number;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lineasAplicables?: string[];

  @ApiPropertyOptional({ enum: ['activo', 'inactivo'], default: 'activo' })
  @IsOptional()
  @IsIn(['activo', 'inactivo'])
  estado?: 'activo' | 'inactivo';
}

export class UpdateCausaParadaDto extends PartialType(CreateCausaParadaDto) {}

export class CausaParadaQueryDto {
  @ApiPropertyOptional({ enum: ['arbol', 'plano'], default: 'arbol' })
  @IsOptional()
  @IsIn(['arbol', 'plano'])
  formato?: 'arbol' | 'plano';

  @ApiPropertyOptional({ enum: NIVELES_CAUSA })
  @IsOptional()
  @IsIn(NIVELES_CAUSA)
  nivel?: NivelCausa;

  @ApiPropertyOptional({ example: 'LIN-02' })
  @IsOptional()
  @IsString()
  lineaId?: string;
}

export class BajaCausaResponseDto {
  @ApiProperty({ example: 'CPA-PM-01-03' }) id!: string;
  @ApiProperty({ example: 'PM-01-03' }) codigo!: string;
  @ApiProperty({ example: 'inactivo' }) estado!: 'inactivo';
  @ApiProperty({ example: 14, description: 'Paradas históricas que conservan el código' })
  paradasConservadas!: number;
  @ApiProperty() mensaje!: string;
}
