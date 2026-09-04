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
  @ApiProperty({ example: 'PN-02-04', description: 'PN-02, PN-02-A o PN-02-01' })
  @IsString()
  @Matches(/^P[A-Z]-\d{2}(-[A-Z0-9]{1,2})?$/, {
    message: 'Formato esperado PP-01, PP-01-A o PP-01-01',
  })
  codigo!: string;

  @ApiProperty({ example: 'Rotura de piñón' })
  @IsString()
  @MinLength(3, { message: 'El nombre es obligatorio' })
  nombre!: string;

  @ApiProperty({ enum: NIVELES_CAUSA })
  @IsIn(NIVELES_CAUSA)
  nivel!: NivelCausa;

  @ApiPropertyOptional({ example: 'CPA-PN-02-A', nullable: true })
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

  @ApiPropertyOptional({
    example: 'RUT04',
    nullable: true,
    description: 'Código del sistema original (`PNP`, `RUT04`, `FAL02`, `IMP10`)',
  })
  @IsOptional()
  @IsString()
  codigoLegado?: string | null;
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

  @ApiPropertyOptional({ example: 'LIN-LLEN-M2' })
  @IsOptional()
  @IsString()
  lineaId?: string;
}

export { BajaCausaParadaResponseDto as BajaCausaResponseDto } from './baja.dto';
